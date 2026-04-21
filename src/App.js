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
const DECKS_STORAGE_KEY = "flashcardmaker.decks.v1";

const HSK_LEVELS = [
  { level: 1, label: "HSK 1", description: "Book 1" },
  { level: 2, label: "HSK 2", description: "Book 2" },
  { level: 3, label: "HSK 3", description: "Book 3" },
  { level: 4, label: "HSK 4", description: "Book 4" },
  { level: 5, label: "HSK 5", description: "Book 5" },
  { level: 6, label: "HSK 6", description: "Book 6" },
];

function App() {
  const [mode, setMode] = useState("study"); // "study" | "edit"
  const [selectedDeck, setSelectedDeck] = useState(1); // HSK level 1-6
  const [decks, setDecks] = useState(() => {
    try {
      const raw = localStorage.getItem(DECKS_STORAGE_KEY);
      if (!raw) {
        // Initialize with sample decks for each HSK level
        const initialDecks = {};
        HSK_LEVELS.forEach((hsk) => {
          initialDecks[hsk.level] = [];
        });
        // Add sample cards to HSK 1
        initialDecks[1] = [
          { id: "1", hanzi: "你", pinyin: "nǐ", english: "you" },
          { id: "2", hanzi: "好", pinyin: "hǎo", english: "good; well" },
          { id: "3", hanzi: "谢", pinyin: "xiè", english: "thanks" },
        ];
        return initialDecks;
      }
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object") return {};
      return parsed;
    } catch {
      return {};
    }
  });

  const cards = decks[selectedDeck] || [];

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
    setDecks((prev) => ({
      ...prev,
      [selectedDeck]: [newCard, ...(prev[selectedDeck] || [])],
    }));
    setActiveIndex(0);
  }, [selectedDeck]);

  const deleteCard = useCallback((id) => {
    setDecks((prev) => ({
      ...prev,
      [selectedDeck]: (prev[selectedDeck] || []).filter((c) => c.id !== id),
    }));
  }, [selectedDeck]);

  const updateDeckCards = useCallback((newCards) => {
    setDecks((prev) => ({
      ...prev,
      [selectedDeck]: newCards,
    }));
  }, [selectedDeck]);

  const shuffleCards = useCallback(() => {
    const currentCards = decks[selectedDeck] || [];
    if (currentCards.length === 0) return;
    
    // Fisher-Yates shuffle algorithm
    const shuffled = [...currentCards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    updateDeckCards(shuffled);
    setIsShuffled(true);
    setActiveIndex(0);
  }, [decks, selectedDeck, updateDeckCards]);

  const resetOrder = useCallback(() => {
    // For now, just reset shuffle flag since we don't track original order per deck
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
    link.setAttribute("download", `chinese-flashcards-hsk${selectedDeck}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [cards, selectedDeck]);

  useEffect(() => {
    try {
      localStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(decks));
    } catch {
      // If storage is unavailable/full, keep app functional without persistence.
    }
  }, [decks]);

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
  const [uploadStatus, setUploadStatus] = useState(null); // null | 'success' | 'error'
  const fileInputRef = useRef(null);
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

  const parseCSV = useCallback((text) => {
    // Remove UTF-8 BOM if present
    const cleanText = text.startsWith('\uFEFF') ? text.slice(1) : text;
    
    // Split into lines and filter empty lines
    const lines = cleanText.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) return [];
    
    // Parse header to find column indices
    const headerLine = lines[0].toLowerCase();
    const headers = headerLine.split(',').map(h => h.trim().replace(/"/g, ''));
    
    const charIndex = headers.findIndex(h => h.includes('character') || h.includes('hanzi'));
    const pinyinIndex = headers.findIndex(h => h.includes('pinyin'));
    const transIndex = headers.findIndex(h => h.includes('translation') || h.includes('english'));
    
    if (charIndex === -1 || pinyinIndex === -1 || transIndex === -1) {
      throw new Error('CSV must have headers: character, pinyin, and translation');
    }
    
    // Parse data rows
    const newCards = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Simple CSV parsing (handles quoted fields)
      const fields = [];
      let current = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          fields.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      fields.push(current.trim());
      
      const hanzi = fields[charIndex]?.replace(/"/g, '').trim();
      const pinyin = fields[pinyinIndex]?.replace(/"/g, '').trim();
      const english = fields[transIndex]?.replace(/"/g, '').trim();
      
      if (hanzi && pinyin && english) {
        const id = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()) + i;
        
        newCards.push({ id, hanzi, pinyin, english });
      }
    }
    
    return newCards;
  }, []);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.name.endsWith('.csv')) {
      setUploadStatus('error');
      setTimeout(() => setUploadStatus(null), 3000);
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const newCards = parseCSV(event.target.result);
        
        if (newCards.length === 0) {
          setUploadStatus('error');
          setTimeout(() => setUploadStatus(null), 3000);
          return;
        }
        
        // Add uploaded cards to current deck
        setDecks((prev) => ({
          ...prev,
          [selectedDeck]: [...newCards, ...(prev[selectedDeck] || [])],
        }));
        
        setActiveIndex(0);
        setUploadStatus('success');
        setTimeout(() => setUploadStatus(null), 3000);
        
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        console.error('CSV parse error:', error);
        setUploadStatus('error');
        setTimeout(() => setUploadStatus(null), 3000);
      }
    };
    
    reader.readAsText(file);
  }, [parseCSV, selectedDeck]);

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

          <div className="topbar__controls">
            <div className="deck-selector">
              <label htmlFor="deckLevel" className="deck-selector__label">Deck Level:</label>
              <select
                id="deckLevel"
                value={selectedDeck}
                onChange={(e) => {
                  setSelectedDeck(Number(e.target.value));
                  setActiveIndex(0);
                  setIsShuffled(false);
                  setStats({ attempted: 0, correct: 0 });
                }}
                className="deck-selector__select"
                aria-label="Select HSK deck level"
              >
                {HSK_LEVELS.map((hsk) => (
                  <option key={hsk.level} value={hsk.level}>
                    {hsk.label} - {hsk.description}
                  </option>
                ))}
              </select>
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
        </div>

        <div className="deck-overview">
          <div className="deck-overview__title">Deck Overview</div>
          <div className="deck-overview__grid">
            {HSK_LEVELS.map((hsk) => {
              const cardCount = (decks[hsk.level] || []).length;
              const isActive = selectedDeck === hsk.level;
              return (
                <button
                  key={hsk.level}
                  className={`deck-overview__card ${isActive ? 'deck-overview__card--active' : ''}`}
                  onClick={() => {
                    setSelectedDeck(hsk.level);
                    setActiveIndex(0);
                    setIsShuffled(false);
                    setStats({ attempted: 0, correct: 0 });
                  }}
                  aria-label={`Select ${hsk.label} with ${cardCount} cards`}
                >
                  <div className="deck-overview__level">{hsk.label}</div>
                  <div className="deck-overview__count">{cardCount} cards</div>
                  <div className="deck-overview__desc">{hsk.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        {mode === "study" ? (
          <div className="panel">
            <div className="meta">
              <div className="pill" aria-label="Current deck level">
                {HSK_LEVELS.find(h => h.level === selectedDeck)?.label || 'HSK 1'}
              </div>
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
            <div className="deck-info">
              <div className="deck-info__title">
                Currently editing: {HSK_LEVELS.find(h => h.level === selectedDeck)?.label || 'HSK 1'}
              </div>
              <div className="deck-info__desc">
                {HSK_LEVELS.find(h => h.level === selectedDeck)?.description || ''}
              </div>
            </div>

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

            <div className="upload-section">
              <div className="upload-section__title">Upload CSV to Deck</div>
              <div className="upload-section__desc">
                Import cards from a CSV file with headers: character, pinyin, translation
              </div>
              <div className="upload-section__controls">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="upload-section__input"
                  aria-label="Upload CSV file"
                />
                <button
                  className="btnGhost"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  📁 Choose CSV File
                </button>
              </div>
              {uploadStatus === 'success' && (
                <div className="upload-status upload-status--success">
                  ✓ Cards uploaded successfully!
                </div>
              )}
              {uploadStatus === 'error' && (
                <div className="upload-status upload-status--error">
                  ✗ Upload failed. Check CSV format.
                </div>
              )}
            </div>

            <div className="list" aria-label="Card list">
              <div className="list__title">
                {HSK_LEVELS.find(h => h.level === selectedDeck)?.label || 'HSK 1'} Deck ({cards.length})
              </div>
              {cards.length === 0 ? (
                <div className="emptySmall">No cards yet. Add some above!</div>
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
