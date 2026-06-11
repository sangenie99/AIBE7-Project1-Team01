// community.js
(function () {
  let supabaseClient = null;

  // 환경변수 로드 우선순위:
  // 1) server.js가 제공하는 /config.js (window.SUPABASE_URL 등)
  // 2) .env 파일 직접 fetch (로컬 개발 환경)
  // 3) 하드코딩 fallback
  async function loadEnv() {
    // 1) server.js /config.js 가 window에 이미 주입한 경우
    if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
      return {
        SUPABASE_URL: window.SUPABASE_URL,
        SUPABASE_ANON_KEY: window.SUPABASE_ANON_KEY,
      };
    }

    // 2) .env 파일 fetch 시도 (로컬 개발 전용)
    try {
      const response = await fetch(".env");
      if (!response.ok) throw new Error("Failed to fetch .env");
      const text = await response.text();
      const env = {};
      text.split("\n").forEach((line) => {
        const parts = line.split("=");
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts
            .slice(1)
            .join("=")
            .trim()
            .replace(/^['"]|['"]$/g, "");
          env[key] = value;
        }
      });
      if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) return env;
      throw new Error(".env에 필요한 키가 없습니다.");
    } catch (e) {
      // 3) 하드코딩 fallback
      console.warn("Using local fallback config for Supabase:", e);
      return {
        SUPABASE_URL: "https://sojcpuqpgxwzbntddqky.supabase.co",
        SUPABASE_ANON_KEY: "sb_publishable_43B2szllehr5fAD5C72cgw_gLAON3Vs",
      };
    }
  }

  // Initialize Auth & Supabase Client
  window.initAuth = async function () {
    if (supabaseClient) return supabaseClient;

    const env = await loadEnv();
    if (window.supabase) {
      supabaseClient = window.supabase.createClient(
        env.SUPABASE_URL,
        env.SUPABASE_ANON_KEY,
      );
      window.supabaseClient = supabaseClient;
      await handleAuthState();

      // supabaseClient 준비 완료를 다른 스크립트에 알림
      window.dispatchEvent(
        new CustomEvent("supabase-ready", {
          detail: { client: supabaseClient },
        }),
      );
    } else {
      console.error(
        'Supabase library is not loaded. Please include: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>',
      );
    }
    return supabaseClient;
  };

  // Handle page-specific UI rendering and authentication logic
  async function handleAuthState() {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    const user = session ? session.user : null;
    updateNavigation(user);

    // Page-specific behaviors
    const pathname = window.location.pathname;
    if (pathname.includes("mypage.html")) {
      if (!user) {
        alert("로그인이 필요한 페이지입니다. 로그인 페이지로 이동합니다.");
        window.location.href = "login.html";
      } else {
        // mypage.html의 스크립트에 유저 정보 전달
        window.dispatchEvent(
          new CustomEvent("mypage-ready", { detail: { user } }),
        );
      }
    }
  }

  // Dynamically update navbar options based on user log in state
  function updateNavigation(user) {
    const navRight = document.querySelector(".nav-right");
    if (!navRight) return;

    // 새 구조: #nav-guest / #nav-user 가 있는 페이지
    const guestNav = document.getElementById("nav-guest");
    const userNav = document.getElementById("nav-user");

    if (guestNav && userNav) {
      if (user) {
        guestNav.style.display = "none";
        userNav.style.display = "flex";
        userNav.style.alignItems = "center";
        userNav.style.gap = "15px";
        // 이메일 대신 마이페이지 로고만 보이도록 이메일 텍스트 숨김
        const emailDisplay = document.getElementById("user-email-display");
        if (emailDisplay) emailDisplay.style.display = "none";
      } else {
        guestNav.style.display = "flex";
        guestNav.style.alignItems = "center";
        guestNav.style.gap = "15px";
        userNav.style.display = "none";
      }
      // 로그아웃 버튼 이벤트 연결
      const logoutBtn = document.getElementById("logout-btn");
      if (logoutBtn) {
        logoutBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          await logout();
        });
      }
      return;
    }

    // 기존 구조 fallback: #nav-guest/#nav-user 가 없는 페이지
    if (user) {
      navRight.innerHTML = `
        <a href="mypage.html" class="nav-icon-link">
          <img src="icons/mypage-icon.png" alt="마이페이지" class="nav-mypage-img" />
        </a>
        <a href="#" id="logout-btn" class="nav-btn-outline">로그아웃</a>
      `;
      const logoutBtn = document.getElementById("logout-btn");
      if (logoutBtn) {
        logoutBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          await logout();
        });
        //로그아웃 버튼 리스너 true
        logoutBtn.dataset.listenerAttached = "true";
      }
    } else {
     // [수정사항] 회원가입 버튼 삭제 + 로그인 링크를 텍스트형(.nav-login-link)으로 변경,
      //           로그인 텍스트 옆에 유저 아이콘 SVG를 추가해 하나의 링크로 묶음.
      navRight.innerHTML = `
        <a href="login.html" class="nav-login-link">
          <svg class="nav-login-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M4 21a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>로그인</span>
        </a>
      `;
    }
  }

  // Handle Logout flow
  async function logout() {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
      alert("로그아웃 되었습니다.");
      window.location.href = "index.html";
    }
  }

   // ===== 로그인 팝업(모달) =====
  // [수정사항] 로그인 방식 변경: 페이지 이동(login.html) → 팝업(모달)
  // - community.js가 모든 페이지에 공통 로드되므로, 여기서 모달 HTML을 동적 주입하고
  //   login.html로 향하는 링크 클릭을 가로채 페이지 이동 대신 모달을 띄운다.
  // - 스타일은 css/login-modal.css (ensureLoginModalStyles에서 동적 로드).
  const LOGIN_MODAL_ID = "login-modal-overlay";

  function ensureLoginModalStyles() {
    if (document.getElementById("login-modal-css")) return;
    const link = document.createElement("link");
    link.id = "login-modal-css";
    link.rel = "stylesheet";
    // community.js는 항상 html/ 하위 페이지에서 ../js 경로로 로드되므로 ../css 사용
    link.href = "../css/login-modal.css";
    document.head.appendChild(link);
  }

  function buildLoginModal() {
    if (document.getElementById(LOGIN_MODAL_ID)) return;

    const overlay = document.createElement("div");
    overlay.id = LOGIN_MODAL_ID;
    overlay.className = "login-modal-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "login-modal-title");
    overlay.innerHTML = `
      <div class="login-modal">
        <button type="button" class="login-modal-close" data-login-close aria-label="닫기">&times;</button>
        <div class="login-modal-header">
          <h2 class="login-modal-title" id="login-modal-title">환영합니다</h2>
          <p class="login-modal-subtitle">당신만의 평온한 여정을 이어가세요.</p>
        </div>
        <form class="login-modal-form" id="login-modal-form">
          <div class="login-modal-field">
            <label class="login-modal-label" for="login-modal-email">이메일 주소</label>
            <input class="login-modal-input" id="login-modal-email" name="email" type="email" placeholder="example@glow.com" autocomplete="email" />
          </div>
          <div class="login-modal-field">
            <label class="login-modal-label" for="login-modal-password">비밀번호</label>
            <input class="login-modal-input" id="login-modal-password" name="password" type="password" placeholder="••••••••" autocomplete="current-password" />
          </div>
          <div class="login-modal-row">
            <label class="login-modal-check">
              <input type="checkbox" id="login-modal-remember" />
              <span>로그인 상태 유지</span>
            </label>
            <a class="login-modal-link" href="#">비밀번호를 잊으셨나요?</a>
          </div>
          <button class="login-modal-submit" type="submit">여정 계속하기</button>
        </form>
        <div class="login-modal-divider"><span>또는</span></div>
        <button type="button" class="login-modal-google" id="login-modal-google">
          <span class="login-modal-google-icon">G</span>
          <span>Google로 로그인</span>
        </button>
        <p class="login-modal-footer">
          아직 회원이 아니신가요?
          <a href="signup.html">회원가입 하기</a>
        </p>
      </div>
    `;
    document.body.appendChild(overlay);

    // 오버레이 바깥 클릭 / 닫기 버튼으로 닫기
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.closest("[data-login-close]")) {
        closeLoginModal();
      }
    });

    // 폼 제출 → 이메일/비밀번호 로그인
    overlay
      .querySelector("#login-modal-form")
      .addEventListener("submit", handleModalLogin);

    // 구글 로그인
    overlay
      .querySelector("#login-modal-google")
      .addEventListener("click", () => handleSocialLogin("google"));
  }

  function openLoginModal() {
    ensureLoginModalStyles();
    buildLoginModal();
    const overlay = document.getElementById(LOGIN_MODAL_ID);
    if (!overlay) return;
    overlay.classList.add("is-open");
    document.body.classList.add("login-modal-open");
    const emailInput = overlay.querySelector("#login-modal-email");
    if (emailInput) setTimeout(() => emailInput.focus(), 50);
    // Supabase 클라이언트 미리 준비
    if (!window.supabaseClient) window.initAuth();
  }

  function closeLoginModal() {
    const overlay = document.getElementById(LOGIN_MODAL_ID);
    if (!overlay) return;
    overlay.classList.remove("is-open");
    document.body.classList.remove("login-modal-open");
  }

  async function handleModalLogin(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = form.querySelector("#login-modal-email").value.trim();
    const password = form.querySelector("#login-modal-password").value.trim();

    if (!email || !password) {
      alert("이메일과 비밀번호를 입력해주세요.");
      return;
    }

    const button = form.querySelector("button[type='submit']");
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML =
      '<span class="login-modal-spinner"></span> 로그인 중...';

    try {
      if (!window.supabaseClient) {
        await window.initAuth();
      }
      const { error } = await window.supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      alert("로그인에 성공했습니다!");
      window.location.reload();
    } catch (error) {
      alert(
        "로그인 실패: " +
          (error.message || "이메일 또는 비밀번호를 확인해주세요."),
      );
      button.innerHTML = original;
      button.disabled = false;
    }
  }

  async function handleSocialLogin(provider) {
    try {
      if (!window.supabaseClient) {
        await window.initAuth();
      }
      const { error } = await window.supabaseClient.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/html/index.html`,
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error(error);
      alert(
        "소셜 로그인 실패: " + (error.message || "잠시 후 다시 시도해주세요."),
      );
    }
  }

  // 로그인 링크(<a href="login.html">) 클릭을 가로채 모달로 전환
  function interceptLoginLinks() {
    document.addEventListener("click", (e) => {
      const trigger = e.target.closest(
        'a[href$="login.html"], a[href="login.html"], [data-login-trigger]',
      );
      if (!trigger) return;
      e.preventDefault();
      openLoginModal();
    });

    // ESC로 닫기
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeLoginModal();
    });
  }

  // 외부에서도 호출 가능하도록 노출
  window.openLoginModal = openLoginModal;
  window.closeLoginModal = closeLoginModal;

  // Auto-run when DOM content has loaded
  document.addEventListener("DOMContentLoaded", () => {
    window.initAuth();
  });
})();
