import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans


def cluster_ticket_issues(df: pd.DataFrame, ticket_analysis: dict, max_clusters: int = 5) -> dict:
    detected = ticket_analysis.get("detected_columns", {})

    issue_col = detected.get("issue_column")
    department_col = detected.get("department_column")
    resolution_col = detected.get("resolution_time_column")

    if not issue_col:
        return {
            "clusters_found": False,
            "message": "No issue or description column detected for clustering."
        }

    texts = df[issue_col].fillna("").astype(str).str.strip()
    texts = texts[texts != ""]

    if len(texts) < 5:
        return {
            "clusters_found": False,
            "message": "Not enough ticket text to perform clustering."
        }

    unique_text_count = texts.nunique()

    if unique_text_count < 2:
        return {
            "clusters_found": False,
            "message": "Not enough unique ticket text to perform clustering."
        }

    cluster_count = min(max_clusters, unique_text_count, len(texts))

    if cluster_count < 2:
        return {
            "clusters_found": False,
            "message": "At least 2 clusters are required."
        }

    vectorizer = TfidfVectorizer(
        stop_words="english",
        ngram_range=(1, 2),
        min_df=1
    )

    matrix = vectorizer.fit_transform(texts)

    model = KMeans(
        n_clusters=cluster_count,
        random_state=42,
        n_init=10
    )

    labels = model.fit_predict(matrix)

    clustered_df = df.loc[texts.index].copy()
    clustered_df["cluster"] = labels

    feature_names = vectorizer.get_feature_names_out()

    clusters = []

    for cluster_id in range(cluster_count):
        cluster_rows = clustered_df[clustered_df["cluster"] == cluster_id]

        center = model.cluster_centers_[cluster_id]
        top_indices = center.argsort()[-5:][::-1]
        top_terms = [feature_names[i] for i in top_indices]

        cluster_info = {
            "cluster_id": int(cluster_id),
            "ticket_count": int(len(cluster_rows)),
            "top_terms": top_terms,
            "example_tickets": cluster_rows[issue_col].head(3).tolist()
        }

        if department_col:
            cluster_info["top_departments"] = (
                cluster_rows[department_col]
                .value_counts()
                .head(3)
                .to_dict()
            )

        if resolution_col:
            cluster_rows[resolution_col] = pd.to_numeric(
                cluster_rows[resolution_col],
                errors="coerce"
            )

            cluster_info["average_resolution_time"] = round(
                float(cluster_rows[resolution_col].mean()),
                2
            )

        clusters.append(cluster_info)

    clusters = sorted(
        clusters,
        key=lambda x: x["ticket_count"],
        reverse=True
    )

    return {
        "clusters_found": True,
        "cluster_count": cluster_count,
        "clusters": clusters
    }