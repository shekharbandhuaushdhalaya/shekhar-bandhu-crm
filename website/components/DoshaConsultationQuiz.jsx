import React, { useState } from 'react';

const QUIZ_QUESTIONS = [
  {
    question: "What is your primary health concern?",
    options: [
      { text: "Joint pain, stiffness, muscular weakness, or anxiety/insomnia.", type: "vata" },
      { text: "Acidity, burning sensations in hands/feet, heat stress, or liver sluggishness.", type: "pitta" },
      { text: "Chronic cough, cold, chest congestion, bloating, or low metabolism.", type: "kapha" }
    ]
  },
  {
    question: "How would you describe your body's response to temperature and skin type?",
    options: [
      { text: "I feel cold very easily, have dry skin, and experience active/anxious thoughts.", type: "vata" },
      { text: "I feel warm easily, have sensitive skin, and high intensity or quick temper.", type: "pitta" },
      { text: "I prefer warm weather, have smooth/oily skin, and have a calm, easygoing nature.", type: "kapha" }
    ]
  },
  {
    question: "How do you prefer your Ayurvedic remedy?",
    options: [
      { text: "Medicated massage oils (Taila) for joint relief and deep tissue care.", type: "vata" },
      { text: "Classical self-fermented liquids (Asava/Arishta) or sweet cooling syrups.", type: "pitta" },
      { text: "Respiratory syrups, herbal tablets (Vati), or nourishing herbal jams (Avaleha).", type: "kapha" }
    ]
  },
  {
    question: "What target support are you looking for in your daily routine?",
    options: [
      { text: "Nerve strength, pain management, and memory/concentration boost.", type: "vata" },
      { text: "Stomach acid neutrality, liver detox, and blood pressure regulation.", type: "pitta" },
      { text: "Lung clearance, cough immunity, piles/fissures relief, and body rejuvenation.", type: "kapha" }
    ]
  }
];

export default function DoshaConsultationQuiz({ products, onSelectProduct, onCloseQuiz }) {
  const [quizOpen, setQuizOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState({ vata: 0, pitta: 0, kapha: 0 });
  const [result, setResult] = useState(null);

  const startQuiz = () => {
    setQuizOpen(true);
    setStep(0);
    setScores({ vata: 0, pitta: 0, kapha: 0 });
    setResult(null);
  };

  const handleOptionClick = (type) => {
    const updatedScores = {
      ...scores,
      [type]: scores[type] + 1
    };
    setScores(updatedScores);

    if (step < QUIZ_QUESTIONS.length - 1) {
      setStep(prev => prev + 1);
    } else {
      let dominant = "vata";
      let maxScore = updatedScores.vata;

      if (updatedScores.pitta > maxScore) {
        dominant = "pitta";
        maxScore = updatedScores.pitta;
      }
      if (updatedScores.kapha > maxScore) {
        dominant = "kapha";
      }
      setResult(dominant);
    }
  };

  const getRecommendations = (resultType) => {
    if (resultType === "vata") {
      return products.filter(p => {
        const dis = p.disease?.toLowerCase() || '';
        const cat = p.category?.toLowerCase() || '';
        return (
          cat.includes("oil") ||
          dis.includes("joint") ||
          dis.includes("neuromuscular") ||
          dis.includes("pain") ||
          dis.includes("memory") ||
          dis.includes("anxiety") ||
          dis.includes("hypertension") ||
          dis.includes("stress")
        );
      });
    }
    if (resultType === "pitta") {
      return products.filter(p => {
        const dis = p.disease?.toLowerCase() || '';
        const cat = p.category?.toLowerCase() || '';
        return (
          dis.includes("ibs") ||
          dis.includes("diarrhea") ||
          dis.includes("periods") ||
          dis.includes("hormonal") ||
          dis.includes("infertility") ||
          dis.includes("heart") ||
          dis.includes("acidity")
        );
      });
    }
    return products.filter(p => {
      const dis = p.disease?.toLowerCase() || '';
      const cat = p.category?.toLowerCase() || '';
      return (
        dis.includes("cough") ||
        dis.includes("cold") ||
        dis.includes("immunity") ||
        dis.includes("asthma") ||
        dis.includes("bronchitis") ||
        dis.includes("liver") ||
        dis.includes("jaundice") ||
        dis.includes("appetite") ||
        dis.includes("piles") ||
        dis.includes("hemorrhoids") ||
        dis.includes("bloating") ||
        dis.includes("gas")
      );
    });
  };

  const getResultBadgeText = (resultType) => {
    if (resultType === "vata") return "Dominant Dosha: Vata imbalance (Air & Space)";
    if (resultType === "pitta") return "Dominant Dosha: Pitta imbalance (Fire & Water)";
    return "Dominant Dosha: Kapha imbalance (Earth & Water)";
  };

  const getResultTitle = (resultType) => {
    if (resultType === "vata") return "Soothing & Warm Joint & Nerve Care";
    if (resultType === "pitta") return "Cooling & Digest Detoxifying Formulas";
    return "Rejuvenating & Clearing Respiratory Remedies";
  };

  return (
    <section id="quiz" className="quiz-section">
      <div className="section-header">
        <span className="section-subtitle">Ayurvedic Consultation</span>
        <h2 className="section-title">Find Your Dosha & Product Recommendations</h2>
      </div>

      <div className="quiz-container">
        {!quizOpen ? (
          <div style={{ textAlign: 'center' }}>
            <h3 className="quiz-intro-title">Discover Your Ayurvedic Profile</h3>
            <p className="quiz-intro-text">
              Answer our certified health questionnaire regarding your physical structure, body heat, digestive fire, and primary concerns. Our tool will analyze your response and recommend Shekhar Bandhu formulations tailored to restore your Vata, Pitta, or Kapha balance.
            </p>
            <button className="btn btn-primary" onClick={startQuiz}>Start Dosha Assessment</button>
          </div>
        ) : !result ? (
          <div>
            <div className="quiz-progress-bar">
              <div 
                className="quiz-progress-fill" 
                style={{ width: `${((step) / QUIZ_QUESTIONS.length) * 100}%` }}
              ></div>
            </div>

            <h3 className="quiz-question-title">
              Question {step + 1} of {QUIZ_QUESTIONS.length}: {QUIZ_QUESTIONS[step].question}
            </h3>

            <div className="quiz-options">
              {QUIZ_QUESTIONS[step].options.map((opt, i) => (
                <div 
                  key={i} 
                  className="quiz-option-card"
                  onClick={() => handleOptionClick(opt.type)}
                >
                  <span className="quiz-option-letter">
                    {String.fromCharCode(65 + i)}.
                  </span>
                  <span className="quiz-option-text">{opt.text}</span>
                </div>
              ))}
            </div>
            
            <div className="quiz-nav-row">
              <button 
                className="btn btn-secondary" 
                style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                onClick={() => setQuizOpen(false)}
              >
                Exit Quiz
              </button>
              {step > 0 && (
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}
                  onClick={() => setStep(prev => prev - 1)}
                >
                  ← Back
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="quiz-results">
            <span className="results-badge">{getResultBadgeText(result)}</span>
            <h3 className="results-title">{getResultTitle(result)}</h3>
            
            {result === "vata" && (
              <p className="results-desc">
                An aggravated Vata leads to dryness, coldness, joint pains, and anxiety. To balance Vata, warm medicated oils like Ksheer Bala Oil, massage therapies, and relaxing nervous-system tonics like Cereplex are highly recommended.
              </p>
            )}
            {result === "pitta" && (
              <p className="results-desc">
                Excessive Pitta triggers internal heat, hyperacidity, skin rashes, and irritability. Balancing Pitta requires cooling, soothing liquid Asavas like Pushpasav and digestive rectifiers like Lotus Syrup or heart health boosters like Pushkar Brahmi Guggul.
              </p>
            )}
            {result === "kapha" && (
              <p className="results-desc">
                A dominant Kapha results in chest congestion, slow digestion, sluggish liver, and weight retention. To balance Kapha, warming respiratory tonics like Basil (Tulsi), Vasavyaghri Haritaki jam, SB Liv liver syrup, and digestive vati like Gasterna are recommended.
              </p>
            )}

            <h4 className="results-recs-title">Recommended Ayurvedic Formulations:</h4>
            <div className="recs-grid">
              {getRecommendations(result).map(rec => (
                <div 
                  key={rec._id} 
                  className="rec-card"
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelectProduct(rec)}
                >
                  <span className="rec-emoji">{rec.emoji}</span>
                  <div style={{ flexGrow: 1 }}>
                    <h5 className="rec-name">{rec.name}</h5>
                    <span className="rec-view-spec" style={{ fontSize: '0.8rem', color: 'var(--color-secondary)', fontWeight: 600 }}>
                      View Product Info →
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={startQuiz}>Restart Assessment</button>
              <button className="btn btn-secondary" onClick={onCloseQuiz}>Close Recommendations</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
