import { useState, useEffect } from "react";
import { db, storage } from "./firebase";
import { ref, uploadBytes } from "firebase/storage";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";

function App() {
  const [image, setImage] = useState(null);
  const [status, setStatus] = useState("");
  const [errorVal, setErrorVal] = useState("");
  const [itemId, setItemId] = useState(null);

  useEffect(() => {
    if (!itemId) return;
    // Listen for changes in the database
    const unsub = onSnapshot(doc(db, "items", itemId), (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        setStatus(data.status);
        if (data.status === 'failed' && data.error) {
          setErrorVal(data.error);
        }
      }
    });
    return () => unsub();
  }, [itemId]);

  const handleUpload = async () => {
    if (!image) return;

    // 1. Generate ID
    const id = uuidv4();
    setItemId(id);
    setStatus("Uploading...");

    try {
      // 2. Write to Real Cloud Database (Create doc FIRST to avoid race condition)
      await setDoc(doc(db, "items", id), {
        status: "pending",
        createdAt: new Date()
      });

      // 3. Upload to Real Cloud Storage
      const fileRef = ref(storage, `uploads/${id}.jpg`);
      const metadata = { customMetadata: { originalName: image.name } };
      await uploadBytes(fileRef, image, metadata);

      setStatus("Waiting for AI moderation...");
    } catch (error) {
      console.error("Upload Error:", error);
      setStatus("Error: Check Console");
    }
  };

  return (
    <div style={{ padding: "50px", textAlign: "center", fontFamily: "Arial" }}>
      <h1>🛒 AI Marketplace</h1>

      <div style={{ marginBottom: "20px" }}>
        <input type="file" onChange={(e) => setImage(e.target.files[0])} />
        <button onClick={handleUpload} style={{ marginLeft: "10px", padding: "5px 15px", cursor: "pointer" }}>
          Sell Item
        </button>
      </div>

      {status && (
        <div style={{ marginTop: "20px", padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
          <h3>Status:
            <span style={{
              color: status === 'approved' ? 'green' : status === 'rejected' ? 'red' : 'orange',
              fontWeight: 'bold',
              marginLeft: '10px'
            }}>
              {status.toUpperCase()}
            </span>
          </h3>

          {status === "pending" && <p>🤖 AI is checking your image...</p>}
          {status === "approved" && <p>✅ Your item is live on the store!</p>}
          {status === "rejected" && <p>❌ Item removed. NSFW content detected.</p>}
          {status === "failed" && <p style={{ color: 'red' }}>⚠️ Error: {errorVal || "Unknown error occurred"}</p>}
        </div>
      )}
    </div>
  );
}

export default App;