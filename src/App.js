import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

function normalizePinyin(value) {
  const s = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  // Remove tone marks (keep tone numbers if user types them).
  // Also treat ü/v as u for easy typing on US keyboards.
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ü/g, "u")
    .replace(/v/g, "u");
}

const CARDS_STORAGE_KEY = "flashcardmaker.cards.v1";

function App() {
  const [mode, setMode] = useState("study"); // "study" | "edit"
  const [cards, setCards] = useState(() => {
    try {
      const raw = localStorage.getItem(CARDS_STORAGE_KEY);
      if (!raw) {
        return [
          { id: "1", hanzi: "你", pinyin: "nǐ", english: "you" },
          { id: "2", hanzi: "好", pinyin: "hǎo", english: "good; well" },
          { id: "3", hanzi: "谢", pinyin: "xiè", english: "thanks" },
        ];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
      return [];
    }
  });

  const [isShuffled, setIsShuffled] = useState(false);

  const [activeIndex, setActiveIndex] = useState(0);
  const activeCard = cards[activeIndex] ?? null;

  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null); // null | boolean
  const [stats, setStats] = useState({ attempted: 0, correct: 0 });

  const answerInputRef = useRef(null);

  const accuracy = useMemo(() => {
    if (stats.attempted === 0) return 0;
    return Math.round((stats.correct / stats.attempted) * 100);
  }, [stats.attempted, stats.correct]);

  const resetForCard = useCallback(() => {
    setAnswer("");
    setSubmitted(false);
    setIsCorrect(null);
    queueMicrotask(() => answerInputRef.current?.focus());
  }, []);

  useEffect(() => {
    resetForCard();
  }, [activeIndex, resetForCard]);

  const goNext = useCallback(() => {
    if (cards.length === 0) return;
    setActiveIndex((i) => (i + 1) % cards.length);
  }, [cards.length]);

  const goPrev = useCallback(() => {
    if (cards.length === 0) return;
    setActiveIndex((i) => (i - 1 + cards.length) % cards.length);
  }, [cards.length]);

  const submit = useCallback(() => {
    if (!activeCard) return;
    if (submitted) return;

    const expected = normalizePinyin(activeCard.pinyin);
    const got = normalizePinyin(answer);
    const ok = expected.length > 0 && got === expected;

    setSubmitted(true);
    setIsCorrect(ok);
    setStats((s) => ({
      attempted: s.attempted + 1,
      correct: s.correct + (ok ? 1 : 0),
    }));
  }, [activeCard, answer, submitted]);

  const reveal = useCallback(() => {
    if (!activeCard) return;
    setSubmitted(true);
    setIsCorrect(null);
  }, [activeCard]);

  const addCard = useCallback((newCard) => {
    setCards((prev) => [{ ...newCard }, ...prev]);
    setActiveIndex(0);
  }, []);

  const deleteCard = useCallback((id) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const shuffleCards = useCallback(() => {
    setCards((prev) => {
      if (prev.length === 0) return prev;
      // Fisher-Yates shuffle algorithm
      const shuffled = [...prev];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    });
    setIsShuffled(true);
    setActiveIndex(0);
  }, []);

  const resetOrder = useCallback(() => {
    // Reload original order from localStorage
    try {
      const raw = localStorage.getItem(CARDS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setCards(parsed);
          setIsShuffled(false);
          setActiveIndex(0);
          return;
        }
      }
    } catch {
      // Fallback: just disable shuffle flag
    }
    setIsShuffled(false);
    setActiveIndex(0);
  }, []);

  const downloadCSV = useCallback(() => {
    if (cards.length === 0) return;

    // Create CSV content with headers
    const headers = "character,pinyin,translation";
    const rows = cards.map((card) => {
      // Escape quotes and wrap fields in quotes to handle commas in content
      const hanzi = `"${card.hanzi.replace(/"/g, '""')}"`;
      const pinyin = `"${card.pinyin.replace(/"/g, '""')}"`;
      const english = `"${card.english.replace(/"/g, '""')}"`;
      return `${hanzi},${pinyin},${english}`;
    });

    const csvContent = [headers, ...rows].join("\n");
    // Add UTF-8 BOM for Excel to properly recognize UTF-8 encoding
    const bom = "\uFEFF";
    const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "chinese-flashcards.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [cards]);

  useEffect(() => {
    try {
      localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(cards));
    } catch {
      // If storage is unavailable/full, keep app functional without persistence.
    }
  }, [cards]);

  useEffect(() => {
    if (activeIndex >= cards.length) {
      setActiveIndex(Math.max(0, cards.length - 1));
    }
  }, [activeIndex, cards.length]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (mode !== "study") return;

      if (e.key === "Enter") {
        e.preventDefault();
        if (!submitted) submit();
        else goNext();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev, mode, submit, submitted]);

  const [draft, setDraft] = useState({ hanzi: "", pinyin: "", english: "" });
  const canAdd =
    draft.hanzi.trim().length > 0 &&
    draft.pinyin.trim().length > 0 &&
    draft.english.trim().length > 0;

  const onCreate = (e) => {
    e.preventDefault();
    if (!canAdd) return;

    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now());

    addCard({
      id,
      hanzi: draft.hanzi.trim(),
      pinyin: draft.pinyin.trim(),
      english: draft.english.trim(),
    });

    setDraft({ hanzi: "", pinyin: "", english: "" });
  };

  return (
    <div className="App">
      <div className="shell" role="application" aria-label="Chinese flashcards">
        <div className="topbar">
          <div className="brand">
            <div className="brand__title">Chinese Flashcards</div>
            <div className="brand__sub">
              Type pinyin, then reveal pinyin + English
            </div>
          </div>

          <div className="seg" role="tablist" aria-label="Mode">
            <button
              className={mode === "study" ? "seg__btn seg__btn--active" : "seg__btn"}
              onClick={() => setMode("study")}
              role="tab"
              aria-selected={mode === "study"}
            >
              Study
            </button>
            <button
              className={mode === "edit" ? "seg__btn seg__btn--active" : "seg__btn"}
              onClick={() => setMode("edit")}
              role="tab"
              aria-selected={mode === "edit"}
            >
              Make cards
            </button>
          </div>
        </div>

        {mode === "study" ? (
          <div className="panel">
            <div className="meta">
              <div className="pill" aria-label="Deck size">
                Deck: <b>{cards.length}</b>
              </div>
              <div className="pill" aria-label="Score">
                Score: <b>{stats.correct}</b>/<b>{stats.attempted}</b> ({accuracy}%)
              </div>
              {isShuffled && (
                <div className="pill pill--info" aria-label="Shuffled mode active">
                  🔀 Shuffled
                </div>
              )}
              {cards.length > 0 && (
                <>
                  <button
                    className="pill pill--btn"
                    onClick={isShuffled ? resetOrder : shuffleCards}
                    aria-label={isShuffled ? "Reset card order" : "Shuffle cards"}
                  >
                    {isShuffled ? "↺ Reset Order" : "⇄ Shuffle"}
                  </button>
                  <button
                    className="pill pill--btn"
                    onClick={downloadCSV}
                    aria-label="Download deck as CSV"
                  >
                    ⬇ Download CSV
                  </button>
                </>
              )}
            </div>

            {activeCard ? (
              <>
                <div className="card" aria-label="Flashcard">
                  <div className="hanzi" aria-label="Chinese character">
                    {activeCard.hanzi}
                  </div>

                  <div className="answerRow">
                    <label className="label" htmlFor="pinyinAnswer">
                      Your pinyin answer
                    </label>
                    <input
                      id="pinyinAnswer"
                      ref={answerInputRef}
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      className="input"
                      placeholder='e.g. "ni" or "nǐ"'
                      autoComplete="off"
                      spellCheck={false}
                      disabled={submitted}
                      aria-label="Pinyin answer input"
                    />

                    <div className="actions">
                      <button
                        className="btnPrimary"
                        onClick={submit}
                        disabled={submitted || answer.trim().length === 0}
                        aria-label="Submit pinyin answer"
                      >
                        Submit
                      </button>
                      <button
                        className="btnGhost"
                        onClick={() => {
                          if (!submitted) reveal();
                          else goNext();
                        }}
                        aria-label={submitted ? "Next card" : "Reveal answer"}
                      >
                        {submitted ? "Next" : "Reveal"}
                      </button>
                    </div>
                  </div>

                  {submitted ? (
                    <div
                      className={
                        isCorrect === true
                          ? "result result--ok"
                          : isCorrect === false
                          ? "result result--bad"
                          : "result"
                      }
                      aria-label="Result"
                    >
                      {isCorrect === true ? (
                        <div className="result__headline">Correct</div>
                      ) : isCorrect === false ? (
                        <div className="result__headline">Not quite</div>
                      ) : (
                        <div className="result__headline">Answer</div>
                      )}
                      <div className="result__line">
                        Correct pinyin: <b>{activeCard.pinyin}</b>
                      </div>
                      <div className="result__line">
                        English: <b>{activeCard.english}</b>
                      </div>
                    </div>
                  ) : (
                    <div className="hint">
                      Tip: press <b>Enter</b> to submit (or after reveal, to go
                      next). Use <b>←</b>/<b>→</b> to navigate.
                    </div>
                  )}
                </div>

                <div className="nav">
                  <button className="btnGhost" onClick={goPrev} aria-label="Previous card">
                    ← Prev
                  </button>
                  <div className="nav__mid" aria-label="Card position">
                    Card <b>{cards.length === 0 ? 0 : activeIndex + 1}</b> of{" "}
                    <b>{cards.length}</b>
                  </div>
                  <button className="btnGhost" onClick={goNext} aria-label="Next card">
                    Next →
                  </button>
                </div>
              </>
            ) : (
              <div className="empty" aria-label="Empty deck">
                No cards yet. Switch to <b>Make cards</b> to add some.
              </div>
            )}
          </div>
        ) : (
          <div className="panel">
            <form className="form" onSubmit={onCreate} aria-label="Create flashcard">
              <div className="form__row">
                <label className="label" htmlFor="hanzi">
                  Chinese character
                </label>
                <input
                  id="hanzi"
                  value={draft.hanzi}
                  onChange={(e) => setDraft((d) => ({ ...d, hanzi: e.target.value }))}
                  className="input"
                  placeholder="e.g. 你"
                  aria-label="Hanzi input"
                />
              </div>

              <div className="form__row">
                <label className="label" htmlFor="pinyin">
                  Pinyin
                </label>
                <input
                  id="pinyin"
                  value={draft.pinyin}
                  onChange={(e) => setDraft((d) => ({ ...d, pinyin: e.target.value }))}
                  className="input"
                  placeholder='e.g. nǐ (or "ni3")'
                  aria-label="Pinyin input"
                />
              </div>

              <div className="form__row">
                <label className="label" htmlFor="english">
                  English translation
                </label>
                <input
                  id="english"
                  value={draft.english}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, english: e.target.value }))
                  }
                  className="input"
                  placeholder="e.g. you"
                  aria-label="English input"
                />
              </div>

              <div className="actions">
                <button className="btnPrimary" type="submit" disabled={!canAdd}>
                  Add card
                </button>
                <button
                  className="btnGhost"
                  type="button"
                  onClick={() => setDraft({ hanzi: "", pinyin: "", english: "" })}
                >
                  Clear
                </button>
              </div>
            </form>

            <div className="list" aria-label="Card list">
              <div className="list__title">Deck ({cards.length})</div>
              {cards.length === 0 ? (
                <div className="emptySmall">No cards yet.</div>
              ) : (
                <ul className="list__items">
                  {cards.map((c) => (
                    <li key={c.id} className="list__item">
                      <div className="list__main">
                        <div className="list__hanzi">{c.hanzi}</div>
                        <div className="list__sub">
                          <span className="mono">{c.pinyin}</span> · {c.english}
                        </div>
                      </div>
                      <button
                        className="btnDanger"
                        onClick={() => deleteCard(c.id)}
                        aria-label={`Delete card ${c.hanzi}`}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
