import math
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Compute cosine similarity between two vectors."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    
    dot_product = sum(a * b for a, b in zip(v1, v2))
    norm_a = math.sqrt(sum(a * a for a in v1))
    norm_b = math.sqrt(sum(b * b for b in v2))
    
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot_product / (norm_a * norm_b)

class LeaderFollowerClusterer:
    """
    A lightweight, incremental clustering algorithm suitable for low-resource environments.
    It performs a single pass over the data (O(N*K)) where N is number of items and K is number of clusters.
    """
    
    def __init__(self, threshold: float = 0.75):
        self.threshold = threshold
        # Clusters structure: 
        # [
        #   {
        #     "centroid": List[float], 
        #     "members": List[Dict],  # List of note objects
        #     "id": int
        #   }
        # ]
        self.clusters: List[Dict[str, Any]] = []

    def add_note(self, note: Dict[str, Any]):
        """
        Add a note to the clusters.
        note expected format: {"id": ..., "embedding": [...], "title": ...}
        """
        vec = note.get("embedding")
        if not vec:
            logger.warning(f"Note {note.get('id')} has no embedding, skipping clustering.")
            return

        best_cluster = None
        best_sim = -1.0

        # Find best matching cluster
        for cluster in self.clusters:
            sim = cosine_similarity(vec, cluster["centroid"])
            if sim > self.threshold and sim > best_sim:
                best_sim = sim
                best_cluster = cluster

        if best_cluster:
            # Add to existing cluster
            best_cluster["members"].append(note)
            # Update centroid (Simple moving average for simplicity and speed)
            # In a strict Leader-Follower, the leader (first item) often defines the centroid.
            # Here we can do a weighted update or just keep the leader. 
            # Keeping the leader is faster and strictly O(1) update.
            # Let's start with "Leader fixes the centroid" which is the classic "Leader" algorithm.
            # It's faster and prevents drift.
            pass 
        else:
            # Create new cluster
            new_cluster = {
                "id": len(self.clusters),
                "centroid": vec, # This note becomes the leader
                "members": [note],
                "leader_title": note.get("title", "Untitled")
            }
            self.clusters.append(new_cluster)

    def get_clusters(self) -> List[Dict[str, Any]]:
        return self.clusters

    def get_micro_clusters_for_llm(self) -> List[Dict[str, Any]]:
        """
        Prepare a summarized view of clusters for the LLM.
        Returns a list of clusters with just representative titles.
        """
        summary = []
        for cluster in self.clusters:
            # Get up to 3 titles from members to represent this cluster
            titles = [m.get("title", "Untitled") for m in cluster["members"][:3]]
            summary.append({
                "cluster_id": cluster["id"],
                "representative_titles": titles,
                "count": len(cluster["members"])
            })
        return summary
