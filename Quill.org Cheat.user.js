// ==UserScript==
// @name         Quill.org Cheat
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Get answers for Quill.org
// @author       Potassium_
// @match        https://www.quill.org/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=quill.org
// @grant        none
// @updateURL    https://github.com/ImPotassium/quill-cheat/raw/main/code.js
// @downloadURL  https://github.com/ImPotassium/quill-cheat/raw/main/code.js
// ==/UserScript==

(function () {
    "use strict";

    let answersPanel = null;
    let currentQuestionKey = null;
    let lessonQuestions = [];

    function injectStyles() {
      const styles = document.createElement("style");
      styles.textContent = `
        .quill-cheat-panel {
          position: fixed;
          bottom: 16px;
          left: 50%;
          transform: translateX(-50%);
          width: 420px;
          max-width: calc(100vw - 32px);
          background: #ffffff;
          color: #000000;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          border: 2px solid #06806b;
          border-radius: 12px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
          transition: transform 0.3s ease, opacity 0.3s ease;
        }
        .quill-cheat-panel.collapsed {
          transform: translateX(-50%) translateY(calc(100% - 42px));
        }
        .quill-cheat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          cursor: pointer;
          user-select: none;
          background: #f8f8f8;
          border-bottom: 1px solid #06806b;
          border-radius: 10px 10px 0 0;
        }
        .quill-cheat-panel.collapsed .quill-cheat-header {
          border-radius: 10px;
          border-bottom: none;
        }
        .quill-cheat-header:hover {
          background: #f0f0f0;
        }
        .quill-cheat-title {
          font-weight: 700;
          font-size: 14px;
          color: #06806b;
        }
        .quill-cheat-toggle {
          font-size: 16px;
          color: #057360;
          transition: transform 0.3s ease;
        }
        .quill-cheat-panel.collapsed .quill-cheat-toggle {
          transform: rotate(180deg);
        }
        .quill-cheat-body {
          max-height: 220px;
          overflow-y: auto;
          padding: 10px 12px;
        }
        .quill-cheat-body::-webkit-scrollbar {
          width: 6px;
        }
        .quill-cheat-body::-webkit-scrollbar-track {
          background: #f8f8f8;
          border-radius: 3px;
        }
        .quill-cheat-body::-webkit-scrollbar-thumb {
          background: #06806b;
          border-radius: 3px;
        }
        .quill-cheat-card {
          background: #f8f8f8;
          border: 1px solid #06806b;
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .quill-cheat-card:last-child {
          margin-bottom: 0;
        }
        .quill-cheat-card:hover {
          background: #06806b;
          border-color: #057360;
          transform: translateX(4px);
        }
        .quill-cheat-card:hover .quill-cheat-card-text {
          color: #ffffff;
        }
        .quill-cheat-card-text {
          flex: 1;
          font-size: 14px;
          line-height: 1.4;
          color: #000000;
        }
        .quill-cheat-no-answers {
          color: #888;
          font-style: italic;
          text-align: center;
          padding: 16px;
        }
        .quill-cheat-loading {
          color: #06806b;
          text-align: center;
          padding: 16px;
          font-weight: 600;
        }
      `;
      document.head.appendChild(styles);
    }

    function createPanel() {
      if (answersPanel) return answersPanel;

      answersPanel = document.createElement("div");
      answersPanel.className = "quill-cheat-panel collapsed";
      answersPanel.id = "quill-cheat-answers";

      answersPanel.innerHTML = `
        <div class="quill-cheat-header">
          <span class="quill-cheat-title">Quill Answers</span>
          <span class="quill-cheat-toggle">&#9650;</span>
        </div>
        <div class="quill-cheat-body">
          <div class="quill-cheat-loading">Loading answers...</div>
        </div>
      `;

      answersPanel.querySelector(".quill-cheat-header").addEventListener("click", () => {
        answersPanel.classList.toggle("collapsed");
      });

      document.body.appendChild(answersPanel);
      return answersPanel;
    }

    function getLessonId() {
      const hash = window.location.hash;
      if (hash) {
        const match = hash.match(/\/lesson\/([^?#/]+)/);
        if (match) return match[1];
      }
      const pathMatch = window.location.pathname.match(/\/lesson\/([^?#/]+)/);
      if (pathMatch) return pathMatch[1];
      return null;
    }

    function getQuestionNumberFromPage() {
      const paragraphs = Array.from(document.querySelectorAll("p"));
      for (const p of paragraphs) {
        const text = p.textContent.trim();
        const match = text.match(/(\d+)\s+of\s+\d+/);
        if (match) return parseInt(match[1], 10) - 1;
      }
      return null;
    }

    function isLessonComplete() {
      const hash = window.location.hash;
      if (hash.includes("/results") || hash.includes("/complete")) return true;
      const allText = document.body.innerText || "";
      if (allText.includes("You've completed the lesson")) return true;
      if (allText.includes("Your results are being saved")) return true;
      return false;
    }

    async function fetchResponsesForQuestion(questionKey) {
      try {
        const url = `https://cms.quill.org/questions/${questionKey}/responses`;
        const response = await fetch(url);
        const data = await response.json();

        if (!Array.isArray(data) || data.length === 0) return [];

        const withText = data.filter((r) => r.text && r.text.trim());
        if (withText.length === 0) return [];

        const sorted = withText.sort((a, b) => {
          if (a.optimal && !b.optimal) return -1;
          if (!a.optimal && b.optimal) return 1;
          return (b.count || 0) - (a.count || 0);
        });

        return sorted.slice(0, 5).map((r) => ({
          text: r.text,
          optimal: r.optimal,
          count: r.count,
        }));
      } catch (error) {
        console.error("Quill Cheat: Error fetching responses:", error);
        return [];
      }
    }

    function updatePanel(responses) {
      if (!answersPanel) return;

      const body = answersPanel.querySelector(".quill-cheat-body");
      const optimal = responses.filter((r) => r.optimal);

      if (optimal.length === 0) {
        body.innerHTML = '<div class="quill-cheat-no-answers">No answers found for this question</div>';
        answersPanel.classList.remove("collapsed");
        return;
      }

      body.innerHTML = "";

      optimal.forEach((response) => {
        const card = document.createElement("div");
        card.className = "quill-cheat-card";

        const textEl = document.createElement("span");
        textEl.className = "quill-cheat-card-text";
        textEl.textContent = response.text;

        card.appendChild(textEl);

        card.addEventListener("click", () => insertAnswer(response.text));

        body.appendChild(card);
      });

      answersPanel.classList.remove("collapsed");
    }

    function findInputField() {
      const selectors = [
        'textarea',
        'input[type="text"]:not([readonly]):not([disabled])',
        '[contenteditable="true"]'
      ];
      const elements = Array.from(document.querySelectorAll(selectors.join(", ")));
      const visible = elements.filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });

      if (visible.length === 0) return null;

      const placeholderMatch = visible.find((el) => {
        const ph = (el.placeholder || el.getAttribute("aria-placeholder") || "").toLowerCase();
        return ph.includes("type your answer") || ph.includes("write your");
      });
      if (placeholderMatch) return placeholderMatch;

      return visible[visible.length - 1];
    }

    function findMultipleChoiceButtons() {
      const buttons = Array.from(document.querySelectorAll(
        'button, [role="button"], label, .answer-option, .choice'
      ));
      return buttons.filter((el) => {
        const rect = el.getBoundingClientRect();
        const text = el.textContent.trim();
        return rect.width > 0 && rect.height > 0 && text.length > 0 && text.length < 200;
      });
    }

    function insertAnswer(text) {
      const input = findInputField();

      if (input) {
        input.focus();

        if (input.tagName === "TEXTAREA" || (input.tagName === "INPUT" && input.type === "text")) {
          const nativeSet = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, "value"
          )?.set || Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, "value"
          )?.set;

          if (nativeSet) {
            nativeSet.call(input, text);
          } else {
            input.value = text;
          }

          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));

          const tracker = input._valueTracker;
          if (tracker) tracker.setValue("");
          input.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (input.isContentEditable) {
          input.textContent = text;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }

        return;
      }

      const mcButtons = findMultipleChoiceButtons();
      const match = mcButtons.find((btn) => {
        const btnText = btn.textContent.trim().toLowerCase();
        return btnText === text.trim().toLowerCase();
      });
      if (match) {
        match.click();
        return;
      }

      navigator.clipboard.writeText(text).then(() => {
        showCopiedToast();
      }).catch(() => {});
    }

    function showCopiedToast() {
      const toast = document.createElement("div");
      toast.textContent = "Answer copied to clipboard";
      toast.style.cssText = `
        position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
        background: #06806b; color: white; padding: 8px 20px; border-radius: 6px;
        font-size: 13px; font-weight: 600; z-index: 9999999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }

    async function loadLesson() {
      const lessonId = getLessonId();
      if (!lessonId) return;

      try {
        const url = `https://www.quill.org/api/v1/lessons/${lessonId}.json`;
        const response = await fetch(url);
        const data = await response.json();
        lessonQuestions = data.questions || [];
      } catch (error) {
        console.error("Quill Cheat: Error loading lesson:", error);
      }
    }

    async function onQuestionChange() {
      if (isLessonComplete()) return;

      const questionIndex = getQuestionNumberFromPage();
      if (questionIndex === null) return;

      if (lessonQuestions.length === 0) {
        await loadLesson();
      }

      if (questionIndex >= lessonQuestions.length) return;

      const questionKey = lessonQuestions[questionIndex].key;
      if (questionKey === currentQuestionKey) return;
      currentQuestionKey = questionKey;

      const body = answersPanel?.querySelector(".quill-cheat-body");
      if (body) body.innerHTML = '<div class="quill-cheat-loading">Loading answers...</div>';

      const responses = await fetchResponsesForQuestion(questionKey);
      updatePanel(responses);
    }

    function watchForInput() {
      const observer = new MutationObserver(() => {
        if (isLessonComplete()) return;
        const input = findInputField();
        if (input) {
          onQuestionChange();
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    function watchUrlChange() {
      let lastQuestionNumber = null;

      setInterval(() => {
        if (isLessonComplete()) {
          if (answersPanel) answersPanel.style.display = "none";
          return;
        }
        if (answersPanel) answersPanel.style.display = "";

        const currentNumber = getQuestionNumberFromPage();
        if (currentNumber !== null && currentNumber !== lastQuestionNumber) {
          lastQuestionNumber = currentNumber;
          currentQuestionKey = null;
          onQuestionChange();
        }
      }, 500);
    }

    function init() {
      injectStyles();
      createPanel();
      loadLesson();
      watchUrlChange();
      watchForInput();

      setTimeout(onQuestionChange, 1500);
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  })();
