const client = window.supabase.createClient(
  "https://jtewynwzbrjqpzlejwli.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0ZXd5bnd6YnJqcXB6bGVqd2xpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NDM0MTYsImV4cCI6MjA4ODExOTQxNn0.yFnUBwdlJBN8gOoRCkg-pyP0XJwsfDGrgxEVYE6ML9E"
);

let pass = localStorage.getItem("Pass");
let currentBoardId = null;
let currentChannel = null;
let boardsChannel = null;
let pendingLikeMsgId = null;

if (pass) init();

function setupTextareaAutoResize() {
  const textarea = document.getElementById("content");
  textarea.addEventListener("input", function() {
    this.style.height = "auto";
    this.style.height = (this.scrollHeight) + "px";
  });
}

// ボードの横スクロールのヒント（矢印）を制御する関数
function updateScrollHint() {
  const list = document.getElementById("boardList");
  const arrow = document.getElementById("scrollHintArrow");
  const arrow2 = document.getElementById("scrollHintArrow2");
  if(!list || !arrow || !arrow2) return;
  
  // スマホサイズで、かつスクロール可能な長さがある場合のみ
  if (window.innerWidth <= 768 && list.scrollWidth > list.clientWidth) {
    // 右端までスクロールしきったら矢印を消す
    if (list.scrollLeft <= 5) {
      arrow.style.opacity = '0';
    } else {
      arrow.style.opacity = '1';
    }
    if (list.scrollLeft + list.clientWidth >= list.scrollWidth - 5) {
      arrow2.style.opacity = '0';
    } else {
      arrow2.style.opacity = '1';
    }
  } else {
    // PCやボード数が少ない場合は隠す
    arrow.style.opacity = '0';
    arrow2.style.opacity = '0';
  }
}

// スクロール時と画面リサイズ時にヒントを更新
document.getElementById("boardList").addEventListener("scroll", updateScrollHint);
window.addEventListener("resize", updateScrollHint);

async function login() {
  const input = document.getElementById("passInput");
  const authCard = document.getElementById("authCard");
  const errorMsg = document.getElementById("authError");
  
  pass = input.value;
  const { data, error } = await client.rpc("verify_pass", { input_pass: pass });
  
  if (data) {
    localStorage.setItem("Pass", pass);
    errorMsg.style.display = "none";
    init();
  } else {
    errorMsg.style.display = "block";
    authCard.classList.remove("shake");
    void authCard.offsetWidth; 
    authCard.classList.add("shake");
  }
}

document.getElementById("passInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});

async function init() {
  document.getElementById("auth").style.display = "none";
  document.getElementById("app").style.display = "flex";

  const savedName = localStorage.getItem("Nickname");
  if (savedName) document.getElementById("nickname").value = savedName;

  setupTextareaAutoResize();
  await loadBoards();

  document.getElementById("content").addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      send();
    }
  });

  setupBoardsRealtime();
}

function setupBoardsRealtime() {
  if (boardsChannel) client.removeChannel(boardsChannel);
  boardsChannel = client
    .channel("boards-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "boards" }, payload => {
      loadBoards();
    }).subscribe();
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

  // ボードを読み込み終わった後にスクロールヒントを判定
  setTimeout(updateScrollHint, 100);
}

function selectBoard(id, title) {
  currentBoardId = id;
  document.getElementById("currentBoardTitle").textContent = title;

  document.querySelectorAll('.board-item').forEach(el => {
    el.classList.toggle('active', el.textContent === title);
  });

  loadMessages();

  if (currentChannel) client.removeChannel(currentChannel);

  currentChannel = client
    .channel("messages-" + id)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages", filter: `board_id=eq.${id}` },
      payload => {
        if (payload.eventType === 'INSERT') {
          appendRealtimeMessage(payload.new);
        } else if (payload.eventType === 'UPDATE') {
          updateMessageUI(payload.new);
        }
      }
    )
    .subscribe();
}

function formatJSTDate(dateStr) {
  const date = new Date(dateStr);
  date.setHours(date.getHours() + 9);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}`;
}

function appendRealtimeMessage(m) {
  const div = document.getElementById("messages");
  const emptyState = div.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const msgDiv = document.createElement("div");
  msgDiv.className = "message";
  const timeStr = formatJSTDate(m.created_at);

  msgDiv.innerHTML = `
    <div class="message-meta">
      <b>${escapeHtml(m.nickname)}</b>
      <span>${timeStr}</span>
    </div>
    <div class="message-bubble">
      <div class="message-text">${escapeHtml(m.content)}</div>
      <div class="message-footer">
        <button class="like-btn" onclick="promptLike('${m.id}')">
          ❤️ <span id="like-count-${m.id}">${m.likes || 0}</span>
        </button>
      </div>
    </div>
  `;

  div.appendChild(msgDiv);
  div.scrollTo({ top: div.scrollHeight, behavior: 'smooth' });
}

function updateMessageUI(m) {
  const countSpan = document.getElementById(`like-count-${m.id}`);
  if (countSpan) {
    countSpan.textContent = m.likes || 0;
    const btn = countSpan.parentElement;
    btn.classList.add('liked-anim');
    setTimeout(() => btn.classList.remove('liked-anim'), 300);
  }
}

async function loadMessages() {
  if (!currentBoardId) return;
  const div = document.getElementById("messages");
  div.innerHTML = `<div class="loading-msg" style="text-align:center; color:#999; margin-top:20px;">読み込み中...</div>`;

  const { data, error } = await client.rpc("get_messages", {
    input_pass: pass,
    input_board: currentBoardId
  });

  if (error) {
    div.innerHTML = `<div style="text-align:center; color:red; margin-top:20px;">読み込みエラーが発生しました。</div>`;
    return;
  }

  div.innerHTML = "";
  if (data.length === 0) {
    div.innerHTML = `
      <div class="empty-state">
        <div class="icon">💬</div>
        <p>まだメッセージがありません。<br>最初のメッセージを送りましょう！</p>
      </div>
    `;
    return;
  }

  data.forEach(m => {
    const msgDiv = document.createElement("div");
    msgDiv.className = "message";
    const timeStr = formatJSTDate(m.created_at);

    msgDiv.innerHTML = `
      <div class="message-meta">
        <b>${escapeHtml(m.nickname)}</b>
        <span>${timeStr}</span>
      </div>
      <div class="message-bubble">
        <div class="message-text">${escapeHtml(m.content)}</div>
        <div class="message-footer">
          <button class="like-btn" onclick="promptLike('${m.id}')">
            ❤️ <span id="like-count-${m.id}">${m.likes || 0}</span>
          </button>
        </div>
      </div>
    `;
    div.appendChild(msgDiv);
  });
  
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
    contentInput.style.height = "auto";
    localStorage.setItem("Nickname", nickname);
  }
  btn.disabled = false;
  contentInput.focus();
}

function toggleBoardForm() {
  const f = document.getElementById("newBoardForm");
  const btn = document.getElementById("addBoardToggle");
  const isShow = f.style.display === "block";
  f.style.display = isShow ? "none" : "block";
  btn.style.transform = isShow ? "rotate(0deg)" : "rotate(45deg)";
  btn.textContent = "+";
  if (!isShow) document.getElementById("newBoardTitle").focus();
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

function promptLike(msgId) {
  pendingLikeMsgId = msgId;
  document.getElementById("likeConfirmModal").style.display = "flex";
}

function closeLikeModal() {
  pendingLikeMsgId = null;
  document.getElementById("likeConfirmModal").style.display = "none";
}

async function executeLike() {
  if (!pendingLikeMsgId) return;
  const msgId = pendingLikeMsgId;
  closeLikeModal();

  const { error } = await client.rpc("increment_like", {
    input_pass: pass,
    target_msg_id: msgId
  });

  if (error) {
    console.error(error);
    alert("いいねの処理に失敗しました。");
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function openRuleModal() {
  document.getElementById("ruleModal").style.display = "flex";
}

function closeRuleModal() {
  document.getElementById("ruleModal").style.display = "none";
}

window.addEventListener("click", function(e) {
  const ruleModal = document.getElementById("ruleModal");
  const likeModal = document.getElementById("likeConfirmModal");
  if (e.target === ruleModal) closeRuleModal();
  if (e.target === likeModal) closeLikeModal();
});