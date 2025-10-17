<style>
/* === 💎 Inspiro AI 登入視窗 === */
#inspiro-login-modal {
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  background: rgba(0,0,0,0.7);
  backdrop-filter: blur(8px);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  font-family: 'Poppins','Noto Sans TC',sans-serif;
}
#inspiro-login-box {
  background: rgba(20,20,20,0.95);
  border: 1px solid rgba(184,138,68,0.5);
  box-shadow: 0 0 30px rgba(184,138,68,0.4);
  border-radius: 18px;
  padding: 40px 50px;
  width: 400px;
  color: #F9F6F1;
  text-align: center;
  animation: fadeIn 0.6s ease;
}
#inspiro-login-box h2 {
  color: #B88A44;
  font-weight: 600;
  margin-bottom: 25px;
}
#inspiro-login-box input {
  width: 100%;
  margin: 10px 0;
  padding: 12px;
  border: 1px solid #B88A44;
  border-radius: 8px;
  background: rgba(255,255,255,0.05);
  color: #fff;
}
#inspiro-login-box button {
  width: 100%;
  margin-top: 10px;
  background: linear-gradient(90deg,#B88A44,#d6b677);
  border: none;
  border-radius: 8px;
  padding: 12px;
  color: #000;
  font-weight: 600;
  cursor: pointer;
  transition: 0.3s;
}
#inspiro-login-box button:hover {
  background: linear-gradient(90deg,#d6b677,#B88A44);
}
#inspiro-msg { margin-top: 12px; font-size: 13px; color: #d9c289; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>

<div id="inspiro-login-modal">
  <div id="inspiro-login-box">
    <h2>Inspiro AI 會員登入</h2>
    <input type="email" id="inspiro-email" placeholder="電子郵件" />
    <input type="password" id="inspiro-password" placeholder="密碼" />
    <button id="inspiro-login-btn">登入</button>
    <p style="margin-top:10px;font-size:13px;opacity:0.8;">
      尚未註冊？<a href="#" id="inspiro-register-link" style="color:#B88A44;">點此註冊</a>
    </p>
    <div id="inspiro-msg"></div>
  </div>
</div>

<script>
(async function(){
  const modal = document.getElementById("inspiro-login-modal");
  const msg = document.getElementById("inspiro-msg");

  // 🧠 檢查登入狀態
  async function checkSession(){
    try {
      const res = await fetch("/api/session", { credentials: "include" });
      const data = await res.json();
      if (!data.loggedIn) modal.style.display = "flex";
    } catch {
      modal.style.display = "flex";
    }
  }

  // ✨ 登入
  document.getElementById("inspiro-login-btn").onclick = async () => {
    const email = document.getElementById("inspiro-email").value.trim();
    const password = document.getElementById("inspiro-password").value.trim();
    if (!email || !password) { msg.innerText = "請輸入帳號與密碼。"; return; }
    msg.innerText = "登入中...";
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.ok) {
      msg.innerText = "登入成功，啟動 Inspiro AI...";
      setTimeout(()=>{ modal.style.display = "none"; location.reload(); }, 1000);
    } else {
      msg.innerText = data.msg || "登入失敗。";
    }
  };

  // ✨ 註冊
  document.getElementById("inspiro-register-link").onclick = async (e) => {
    e.preventDefault();
    const email = document.getElementById("inspiro-email").value.trim();
    const password = document.getElementById("inspiro-password").value.trim();
    if (!email || !password) { msg.innerText = "請輸入要註冊的帳號與密碼。"; return; }
    msg.innerText = "註冊中...";
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    msg.innerText = data.msg;
  };

  // 🚀 啟動檢查
  checkSession();
})();
</script>
