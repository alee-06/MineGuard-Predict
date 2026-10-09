import sys
sys.path.insert(0, '.')
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score, average_precision_score, confusion_matrix

with open('artifacts/model_metadata.json') as f:
    meta = json.load(f)
with open('artifacts/evaluation_metrics.json') as f:
    eval_json = json.load(f)

test_eps = meta['episodes']['test']
df_raw = pd.read_csv('data/generated/synthetic_mine_sensors_150k.csv')

from ml.features import extract_features_dataset, FEATURE_COLUMNS
from ml.labels import create_forward_labels, HORIZONS

df_feat = extract_features_dataset(df_raw)
df_labeled = create_forward_labels(df_feat, threshold=1.0, horizons=HORIZONS)

test_mask = df_labeled['episode_id'].isin(test_eps)
scaler = joblib.load('artifacts/scaler.joblib')

saved_metrics_list = eval_json['metrics']
total_test_minutes = int(test_mask.sum())
simulated_days = total_test_minutes / 1440.0

print(f"Total Test Rows (all episodes): {test_mask.sum()}")
print(f"Total Test Episodes: {len(test_eps)}")
print(f"Simulated Test Days: {simulated_days:.4f} days ({total_test_minutes} minutes)")

results = []

for h in HORIZONS:
    target_name = f"target_exceed_{h}m"
    test_h_mask = test_mask & df_labeled[target_name].notna()
    
    X_test = scaler.transform(df_labeled.loc[test_h_mask, FEATURE_COLUMNS].values)
    y_test = df_labeled.loc[test_h_mask, target_name].values.astype(int)
    
    n_eval = len(y_test)
    n_pos = int(y_test.sum())
    n_neg = n_eval - n_pos
    prev = n_pos / n_eval
    print(f"\n--- Horizon {h}m: Evaluated Rows = {n_eval}, Positives = {n_pos} ({prev*100:.2f}%), Negatives = {n_neg} ---")
    
    for m_name in ['logistic_regression', 'random_forest', 'hist_gradient_boosting']:
        model = joblib.load(f'artifacts/model_{m_name}_{h}m.joblib')
        y_prob = model.predict_proba(X_test)[:, 1]
        y_pred = (y_prob >= 0.5).astype(int)
        
        cm = confusion_matrix(y_test, y_pred)
        tn, fp, fn, tp = cm.ravel()
        
        prec = precision_score(y_test, y_pred, zero_division=0)
        rec = recall_score(y_test, y_pred, zero_division=0)
        f1 = f1_score(y_test, y_pred, zero_division=0)
        roc_auc = roc_auc_score(y_test, y_prob)
        pr_auc = average_precision_score(y_test, y_prob)
        fa_day = fp / simulated_days
        
        saved = next(x for x in saved_metrics_list if x['model_name'] == m_name and x['horizon_minutes'] == h)
        diff_roc = abs(roc_auc - saved['roc_auc'])
        diff_pr = abs(pr_auc - saved['pr_auc'])
        diff_f1 = abs(f1 - saved['f1_score'])
        diff_fa = abs(fa_day - saved['false_alarms_per_day'])
        
        print(f"[{m_name}]")
        print(f"  ROC-AUC: {roc_auc:.4f} (Saved: {saved['roc_auc']:.4f}, Diff: {diff_roc:.5f})")
        print(f"  PR-AUC:  {pr_auc:.4f} (Saved: {saved['pr_auc']:.4f}, Diff: {diff_pr:.5f})")
        print(f"  F1:      {f1:.4f} (Saved: {saved['f1_score']:.4f}, Diff: {diff_f1:.5f})")
        print(f"  Prec:    {prec:.4f} (Saved: {saved['precision']:.4f})")
        print(f"  Rec:     {rec:.4f} (Saved: {saved['recall']:.4f})")
        print(f"  FA/day:  {fa_day:.2f} (Saved: {saved['false_alarms_per_day']:.2f}, Diff: {diff_fa:.5f})")
        print(f"  CM:      TP={tp}, FP={fp}, FN={fn}, TN={tn}")
        
        results.append({
            'horizon': h,
            'model': m_name,
            'n_eval': n_eval,
            'n_pos': n_pos,
            'n_neg': n_neg,
            'roc_auc': roc_auc,
            'pr_auc': pr_auc,
            'f1': f1,
            'precision': prec,
            'recall': rec,
            'fa_day': fa_day,
            'cm': {'tp': tp, 'fp': fp, 'fn': fn, 'tn': tn}
        })
