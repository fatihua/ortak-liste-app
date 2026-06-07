import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("shopping");
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");
  const [urgent, setUrgent] = useState(false);

  const [groupCode, setGroupCode] = useState(
    localStorage.getItem("groupCode") || "",
  );

  const [groupInput, setGroupInput] = useState("");

  const [userName, setUserName] = useState(
    localStorage.getItem("userName") || "",
  );

  const [userNameInput, setUserNameInput] = useState("");

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

  async function addItem() {
    if (!text.trim()) return;
    if (!groupCode) return;

    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const itemsToInsert = lines.map((line) => {
      const isUrgentLine = line.startsWith("!");
      const cleanText = isUrgentLine ? line.slice(1).trim() : line;

      return {
        text: cleanText,
        type: activeTab,
        created_by: userName,
        group_code: groupCode,
        urgent: urgent || isUrgentLine,
      };
    });

    const { error } = await supabase.from("items").insert(itemsToInsert);

    if (error) {
      console.log("Insert error:", error);
      return;
    }

    setText("");
    setUrgent(false);
  }
  async function deleteCompleted() {
    const confirmDelete = window.confirm(
      "Tamamlanan tüm kayıtlar silinsin mi?",
    );

    if (!confirmDelete) return;

    const { error } = await supabase
      .from("items")
      .delete()
      .eq("group_code", groupCode)
      .eq("type", activeTab)
      .eq("done", true);

    if (error) {
      console.log("Delete completed error:", error);
      alert("Tamamlananlar silinirken hata oluştu.");
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

  async function deleteItem(id) {
    const { error } = await supabase
      .from("items")
      .delete()
      .eq("id", id)
      .eq("group_code", groupCode);

    if (error) {
      console.log("Delete error:", error);
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
              placeholder="Örn: fatih-zahide"
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

                {item.created_by && (
                  <div className="item-meta">
                    {item.created_by} ekledi / {formatDate(item.created_at)}
                  </div>
                )}
              </div>

              <button
                className="delete icon-button"
                onClick={() => deleteItem(item.id)}
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
