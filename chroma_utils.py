import chromadb
from chromadb.config import Settings
import uuid
import os
import hashlib

class MemoryManager:
    def __init__(self):
        # Ensure absolute path for persistence to avoid CWD issues
        base_dir = os.path.dirname(os.path.abspath(__file__))
        persist_dir = os.path.join(base_dir, "chroma_db")
        
        self.client = chromadb.PersistentClient(path=persist_dir)

    def _get_collection_name(self, project_name: str):
        # Generate a consistent, safe collection name using hashing
        # This handles non-ASCII characters (like Chinese) correctly by mapping them to a hex string
        hash_object = hashlib.md5(project_name.encode())
        hex_dig = hash_object.hexdigest()
        return f"novel_{hex_dig}"

    def _get_collection(self, project_name: str):
        collection_name = self._get_collection_name(project_name)
        return self.client.get_or_create_collection(name=collection_name)

    def add_memory(self, project_name: str, content: str, metadata: dict = None):
        """添加一段记忆（角色小传、情节要点等）"""
        if metadata is None:
            metadata = {"type": "general"}
            
        collection = self._get_collection(project_name)
        doc_id = str(uuid.uuid4())
        collection.add(
            documents=[content],
            metadatas=[metadata],
            ids=[doc_id]
        )
        return doc_id

    def search_memory(self, project_name: str, query: str, n_results=3):
        """根据查询检索相关记忆"""
        collection = self._get_collection(project_name)
        results = collection.query(
            query_texts=[query],
            n_results=n_results
        )
        # Flatten the list of lists
        if results["documents"]:
            return results["documents"][0]
        return []

    def get_all_memories(self, project_name: str):
        """获取项目的所有记忆"""
        collection = self._get_collection(project_name)
        # ChromaDB get without ids returns all (limit might apply, but usually gets all for small sets)
        results = collection.get()
        return results

    def clear_memory(self, project_name: str):
        """清除所有记忆（适用于新故事）"""
        # Note: delete_collection removes it entirely.
        try:
            collection_name = self._get_collection_name(project_name)
            self.client.delete_collection(collection_name)
        except ValueError:
            pass # Collection doesn't exist
    
    def delete_collection(self, project_name: str):
        """Delete the entire collection for this project"""
        try:
            collection_name = self._get_collection_name(project_name)
            self.client.delete_collection(collection_name)
            return True
        except Exception as e:
            print(f"Error deleting collection: {e}")
            return False
    
    def delete_memory(self, project_name: str, doc_id: str):
        """删除特定的记忆条目"""
        try:
            collection = self._get_collection(project_name)
            collection.delete(ids=[doc_id])
            return True
        except Exception as e:
            print(f"Error deleting memory: {e}")
            return False

# Global instance
memory_manager = MemoryManager()

