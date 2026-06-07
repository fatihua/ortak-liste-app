import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState(
    localStorage.getItem("activeTab") || "shopping",
  );
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [imageFile, setImageFile] = useState(null);

  const [groupCode, setGroupCode] = useState(
    localStorage.getItem("groupCode") || "",
  );

  const [groupInput, setGroupInput] = useState("");

  const [userName, setUserName] = useState(
    localStorage.getItem("userName") || "",
  );

  const [userNameInput, setUserNameInput] = useState("");
  const textareaRef = useRef(null);

  async function loadItems() {
    if (!groupCode) return;

    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("type", activeTab)
      .eq("group_code", groupCode)
      .order("done", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.log("Load error:", error);
      return;
    }

    const sorted = [...(data || [])].sort((a, b) => {
      if (a.done === b.done) {
        return new Date(b.created_at) - new Date(a.created_at);
      }

      return a.done ? 1 : -1;
    });

    setItems(sorted);
  }

  useEffect(() => {
    loadItems();
  }, [activeTab, groupCode]);

  useEffect(() => {
    if (!groupCode) return;

    const channel = supabase
      .channel(`items-realtime-${groupCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "items",
          filter: `group_code=eq.${groupCode}`,
        },
        () => {
          loadItems();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTab, groupCode]);
  useEffect(() => {
    localStorage.setItem("activeTab", activeTab);
  }, [activeTab]);
  async function saveGroupCode() {
    const cleanCode = groupInput.trim().toLowerCase();
    const cleanName = userNameInput.trim();

    if (!cleanCode) {
      alert("Lütfen eşleşme kodunu yaz.");
      return;
    }

    if (!userName && !cleanName) {
      alert("Lütfen adını yaz.");
      return;
    }

    const { data, error } = await supabase
      .from("items")
      .select("id")
      .eq("group_code", cleanCode)
      .limit(1);

    if (error) {
      console.log("Group check error:", error);
      alert("Kod kontrol edilirken hata oluştu.");
      return;
    }

    if (!data || data.length === 0) {
      const confirmCreate = window.confirm(
        "Bu kodla kayıtlı bir liste bulunamadı. Yeni liste oluşturulsun mu?",
      );

      if (!confirmCreate) return;
    }

    localStorage.setItem("groupCode", cleanCode);
    setGroupCode(cleanCode);

    if (!userName && cleanName) {
      localStorage.setItem("userName", cleanName);
      setUserName(cleanName);
    }

    setGroupInput("");
    setUserNameInput("");
  }

  function changeGroupCode() {
    localStorage.removeItem("groupCode");
    setGroupCode("");
    setGroupInput("");
    setItems([]);
  }
  function changeUserName() {
    const newName = window.prompt("Yeni kullanıcı adını yaz:", userName);

    if (!newName || !newName.trim()) return;

    const cleanName = newName.trim();

    localStorage.setItem("userName", cleanName);
    setUserName(cleanName);
  }
  async function uploadImage() {
    if (!imageFile) return null;

    const fileExt = imageFile.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
    const filePath = `${groupCode}/${fileName}`;

    const { error } = await supabase.storage
      .from("item-images")
      .upload(filePath, imageFile);

    if (error) {
      console.log("Image upload error:", error);
      alert("Fotoğraf yüklenirken hata oluştu.");
      return null;
    }

    const { data } = supabase.storage
      .from("item-images")
      .getPublicUrl(filePath);

    return data.publicUrl;
  }
  async function addItem() {
    if (!text.trim()) return;
    if (!groupCode) return;

    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const imageUrl = await uploadImage();
    const itemsToInsert = lines.map((line) => {
      const isUrgentLine = line.startsWith("!");
      const cleanText = isUrgentLine ? line.slice(1).trim() : line;

      return {
        text: cleanText,
        type: activeTab,
        created_by: userName,
        group_code: groupCode,
        urgent: urgent || isUrgentLine,
        image_url: imageUrl,
      };
    });

    const { error } = await supabase.from("items").insert(itemsToInsert);

    if (error) {
      console.log("Insert error:", error);
      return;
    }

    setText("");
    setUrgent(false);
    setImageFile(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }
  }
  async function deleteCompleted() {
    const confirmDelete = window.confirm(
      "Tamamlanan tüm kayıtlar silinsin mi?",
    );

    if (!confirmDelete) return;

    const oldItems = items;

    // Aktif sekmedeki tamamlananları ekrandan hemen kaldır
    setItems((prevItems) => prevItems.filter((item) => !item.done));

    const { error } = await supabase
      .from("items")
      .delete()
      .eq("group_code", groupCode)
      .eq("type", activeTab)
      .eq("done", true);

    if (error) {
      console.log("Delete completed error:", error);
      alert("Tamamlananlar silinirken hata oluştu.");

      // Hata olursa geri getir
      setItems(oldItems);
    }
  }

  async function toggleDone(item) {
    const { error } = await supabase
      .from("items")
      .update({ done: !item.done })
      .eq("id", item.id)
      .eq("group_code", groupCode);

    if (error) {
      console.log("Update error:", error);
    }
  }
  async function editItem(item) {
    const newText = window.prompt("Maddeyi düzenle:", item.text);

    if (!newText || !newText.trim()) return;

    const { error } = await supabase
      .from("items")
      .update({ text: newText.trim() })
      .eq("id", item.id)
      .eq("group_code", groupCode);

    if (error) {
      console.log("Edit error:", error);
      alert("Madde düzenlenirken hata oluştu.");
    }
  }

  async function toggleUrgent(item) {
    const { error } = await supabase
      .from("items")
      .update({ urgent: !item.urgent })
      .eq("id", item.id)
      .eq("group_code", groupCode);

    if (error) {
      console.log("Urgent update error:", error);
      alert("Acil durumu değiştirilirken hata oluştu.");
    }
  }
  async function deleteItem(id) {
    const confirmDelete = window.confirm("Bu kayıt silinsin mi?");

    if (!confirmDelete) return;

    // Ekrandan hemen kaldır
    const oldItems = items;
    setItems((prevItems) => prevItems.filter((item) => item.id !== id));

    const { error } = await supabase
      .from("items")
      .delete()
      .eq("id", id)
      .eq("group_code", groupCode);

    if (error) {
      console.log("Delete error:", error);
      alert("Kayıt silinirken hata oluştu.");

      // Hata olursa eski listeyi geri getir
      setItems(oldItems);
    }

    async function editItem(item) {
      const newText = window.prompt("Maddeyi düzenle:", item.text);

      if (!newText || !newText.trim()) return;

      const { error } = await supabase
        .from("items")
        .update({ text: newText.trim() })
        .eq("id", item.id)
        .eq("group_code", groupCode);

      if (error) {
        console.log("Edit error:", error);
        alert("Madde düzenlenirken hata oluştu.");
      }
    }
    async function toggleUrgent(item) {
      const { error } = await supabase
        .from("items")
        .update({ urgent: !item.urgent })
        .eq("id", item.id)
        .eq("group_code", groupCode);

      if (error) {
        console.log("Urgent update error:", error);
        alert("Acil durumu değiştirilirken hata oluştu.");
      }
    }
  }

  function formatDate(dateString) {
    return new Date(dateString).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (!groupCode) {
    return (
      <div className="app">
        <div className="card">
          <h1>Ortak Liste</h1>

          <p className="info">
            Listeyi kullanmak için ortak eşleşme kodunu gir.
          </p>

          <div className="login-form">
            <input
              value={groupInput}
              onChange={(e) => setGroupInput(e.target.value)}
              placeholder="Örn: fatih-müjde"
              onKeyDown={(e) => {
                if (e.key === "Enter") saveGroupCode();
              }}
            />

            {!userName && (
              <input
                value={userNameInput}
                onChange={(e) => setUserNameInput(e.target.value)}
                placeholder="Adın"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveGroupCode();
                }}
              />
            )}

            <button onClick={saveGroupCode}>Başla</button>
          </div>

          <p className="small-info">
            Aynı kodu giren kişiler aynı alışveriş ve yapılacaklar listesini
            görür.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="card">
        <div className="top-row">
          <div>
            <h1>Ortak Liste</h1>
            <p className="group-label">Kod: {groupCode}</p>
            {userName && <p className="user-label">Kullanıcı: {userName}</p>}
            {userName && (
              <button className="mini-button" onClick={changeUserName}>
                Adı Değiştir
              </button>
            )}
          </div>

          <button className="change-button" onClick={changeGroupCode}>
            Kodu Değiştir
          </button>
        </div>

        <div className="tabs">
          <button
            className={activeTab === "shopping" ? "active" : ""}
            onClick={() => setActiveTab("shopping")}
          >
            Alışveriş
          </button>

          <button
            className={activeTab === "todo" ? "active" : ""}
            onClick={() => setActiveTab("todo")}
          >
            Yapılacaklar
          </button>
        </div>

        <div className="actions-row">
          <button className="secondary-button" onClick={deleteCompleted}>
            Tamamlananları Sil
          </button>
        </div>

        <div className="input-section">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);

              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            placeholder={
              activeTab === "shopping"
                ? "Her satıra bir ürün yaz..."
                : "Her satıra bir görev yaz..."
            }
            rows={3}
            style={{ resize: "none" }}
          />
          <label className="image-option">
            📷 Fotoğraf seç
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files[0])}
            />
          </label>

          {imageFile && (
            <p className="selected-image">Seçilen fotoğraf: {imageFile.name}</p>
          )}
          <label className="urgent-option">
            <input
              type="checkbox"
              checked={urgent}
              onChange={(e) => setUrgent(e.target.checked)}
            />
            Acil olarak işaretle
          </label>

          <button className="add-button" onClick={addItem}>
            Ekle
          </button>
        </div>

        <ul className="list">
          {items.map((item) => (
            <li key={item.id} className={item.urgent ? "urgent-item" : ""}>
              <div className="item-main" onClick={() => toggleDone(item)}>
                <div className="item-text-row">
                  {item.urgent && <span className="urgent-mark">!</span>}

                  <span className={item.done ? "done" : ""}>
                    {item.done ? "✓ " : ""}
                    {item.text}
                  </span>
                </div>
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.text}
                    className="item-image"
                  />
                )}
                {item.created_by && (
                  <div className="item-meta">
                    {item.created_by} ekledi / {formatDate(item.created_at)}
                  </div>
                )}
              </div>
              <button
                className="urgent-toggle icon-button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleUrgent(item);
                }}
              >
                ❗
              </button>
              <button
                className="edit icon-button"
                onClick={(e) => {
                  e.stopPropagation();
                  editItem(item);
                }}
              >
                ✏️
              </button>
              <button
                className="delete icon-button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteItem(item.id);
                }}
              >
                🗑️
              </button>
            </li>
          ))}
        </ul>

        {items.length === 0 && (
          <p className="empty-text">Bu listede henüz kayıt yok.</p>
        )}
      </div>
    </div>
  );
}

export default App;
