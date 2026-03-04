const client = window.supabase.createClient(
  "https://jtewynwzbrjqpzlejwli.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0ZXd5bnd6YnJqcXB6bGVqd2xpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NDM0MTYsImV4cCI6MjA4ODExOTQxNn0.yFnUBwdlJBN8gOoRCkg-pyP0XJwsfDGrgxEVYE6ML9E"
);

let pass = localStorage.getItem("circlePass");
let currentBoardId = null;
let currentChannel = null;
let boardsChannel = null;

if (pass) init();

async function login() {
  const input = document.getElementById("passInput");
  pass = input.value;
  const { data, error } = await client.rpc("verify_pass", { input_pass: pass });
  if (data) {
    localStorage.setItem("circlePass", pass);
    init();
  } else {
    alert("合言葉が違います");
  }
}

async function init() {
  document.getElementById("auth").style.display = "none";
  document.getElementById("app").style.display = "flex";

  const savedName = localStorage.getItem("circleNickname");
  if (savedName) document.getElementById("nickname").value = savedName;

  await loadBoards();

  // ショートカット送信
  document.getElementById("content").addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") send();
  });

  setupBoardsRealtime();

}

function setupBoardsRealtime() {
  if (boardsChannel) {
    client.removeChannel(boardsChannel);
  }

  boardsChannel = client
    .channel("boards-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "boards"
      },
      payload => {
        console.log("boards changed:", payload);
        loadBoards();
      }
    )
    .subscribe();
}

async function loadBoards() {
  const { data, error } = await client.rpc("get_boards", { input_pass: pass });
  if (error) return console.error(error);

  const container = document.getElementById("boardList");
  container.innerHTML = "";

  data.forEach(b => {
    const item = document.createElement("div");
    item.className = `board-item ${currentBoardId === b.id ? 'active' : ''}`;
    item.textContent = b.title;
    item.onclick = () => selectBoard(b.id, b.title);
    container.appendChild(item);
  });

  if (!currentBoardId && data.length > 0) {
    selectBoard(data[0].id, data[0].title);
  }
}

function selectBoard(id, title) {
  currentBoardId = id;
  document.getElementById("currentBoardTitle").textContent = title;

  document.querySelectorAll('.board-item').forEach(el => {
    el.classList.toggle('active', el.textContent === title);
  });

  loadMessages();

  // ★ここが重要
  if (currentChannel) {
    client.removeChannel(currentChannel);
  }

  currentChannel = client
    .channel("messages-" + id)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `board_id=eq.${id}`
      },
      payload => {
        appendRealtimeMessage(payload.new);
      }
    )
    .subscribe();
}

function appendRealtimeMessage(m) {
  const div = document.getElementById("messages");

  const msgDiv = document.createElement("div");
  msgDiv.className = "message";

const date = new Date(m.created_at);

  // 9時間加算
  date.setHours(date.getHours() + 9);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  const timeStr = `${year}/${month}/${day} ${hours}:${minutes}`;

  msgDiv.innerHTML = `
    <div class="message-meta">
      <b>${escapeHtml(m.nickname)}</b>
      <span>${timeStr}</span>
    </div>
    <div class="message-bubble">
      <div class="message-text">${escapeHtml(m.content)}</div>
    </div>
  `;

  div.appendChild(msgDiv);
  div.scrollTop = div.scrollHeight;
}

async function loadMessages() {
  if (!currentBoardId) return;
  const div = document.getElementById("messages");

  const { data, error } = await client.rpc("get_messages", {
    input_pass: pass,
    input_board: currentBoardId
  });

  if (error) return;

  div.innerHTML = "";
  data.forEach(m => {
    const msgDiv = document.createElement("div");
    msgDiv.className = "message";
    
    const date = new Date(m.created_at);

    // 9時間加算
    date.setHours(date.getHours() + 9);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    const timeStr = `${year}/${month}/${day} ${hours}:${minutes}`;

    msgDiv.innerHTML = `
      <div class="message-meta">
        <b>${escapeHtml(m.nickname)}</b>
        <span>${timeStr}</span>
      </div>
      <div class="message-bubble">
        <div class="message-text">${escapeHtml(m.content)}</div>
      </div>
    `;
    div.appendChild(msgDiv);
  });
  
  // 最新位置へスクロール
  div.scrollTop = div.scrollHeight;
}

async function send() {
  const contentInput = document.getElementById("content");
  const nickname = document.getElementById("nickname").value || "匿名";
  const content = contentInput.value.trim();
  
  if (!content || !currentBoardId) return;

  const btn = document.getElementById("sendBtn");
  btn.disabled = true;

  const { error } = await client.rpc("post_message", {
    input_pass: pass,
    input_board_id: currentBoardId,
    input_nickname: nickname,
    input_content: content
  });

  if (!error) {
    contentInput.value = "";
    localStorage.setItem("circleNickname", nickname);
  }
  btn.disabled = false;
}

// フォーム表示切替
function toggleBoardForm() {
  const f = document.getElementById("newBoardForm");
  const btn = document.getElementById("addBoardToggle");
  const isShow = f.style.display === "block";
  f.style.display = isShow ? "none" : "block";
  btn.textContent = isShow ? "+" : "×";
}

async function createNewBoard() {
  const input = document.getElementById("newBoardTitle");
  const title = input.value.trim();
  if (!title) return;

  const { data, error } = await client.rpc("create_board", {
    input_pass: pass,
    input_title: title
  });

  if (!error) {
    input.value = "";
    toggleBoardForm();
    await loadBoards();
    selectBoard(data, title);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function openRuleModal() {
  const modal = document.getElementById("ruleModal");
  modal.style.display = "flex";
}

function closeRuleModal() {
  const modal = document.getElementById("ruleModal");
  modal.style.display = "none";
}

window.addEventListener("click", function(e) {
  const modal = document.getElementById("ruleModal");
  if (e.target === modal) {
    modal.style.display = "none";
  }
});