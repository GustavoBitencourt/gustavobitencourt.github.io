import React, { useEffect, useRef, useState } from 'react';
import './QuizCS.css';
import olofImage from './imgs/olof.png';
import dustImage from './imgs/dust.png';
import follenImage from './imgs/follen.jpg';
import tacoImage from './imgs/taco.webp';
import karambitImage from './imgs/Karambit.jpg';
import awpImage from './imgs/awp.png';
import akImage from './imgs/ak.png';
import romaImage from './imgs/Roma.jpg';
import romaSemFundoImage from './imgs/romasemfundo.png';
import glovesImage from './imgs/gloves.jpg';
import butterImage from './imgs/Butter.jpg';

function QuizCS() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Quiz CS';

    return () => {
      document.title = previousTitle;
    };
  }, []);

  const [quizStarted, setQuizStarted] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [fakeCorrectAnswer, setFakeCorrectAnswer] = useState(null);
  const [showLastChancePrompt, setShowLastChancePrompt] = useState(false);
  const [showPrizeScene, setShowPrizeScene] = useState(false);
  const [isExploding, setIsExploding] = useState(false);
  const [showFinalMessage, setShowFinalMessage] = useState(false);
  const finalQuestionTimeoutRef = useRef(null);
  const prizeTimeoutsRef = useRef([]);
  const suspenseAudioRef = useRef(null);

  const playZoomSound = () => {
    try {
      const audio = new Audio('/sounds/zoom.wav');
      audio.currentTime = 0;
      audio.play();
    } catch (error) {
      // Ignore audio errors to avoid blocking the quiz flow.
    }
  };

  const playShotSound = () => {
    try {
      const audio = new Audio('/sounds/tiro.mp3');
      audio.currentTime = 0;
      audio.play();
    } catch (error) {
      // Ignore audio errors to avoid blocking the quiz flow.
    }
  };

  const stopSuspenseMusic = () => {
    if (suspenseAudioRef.current) {
      suspenseAudioRef.current.pause();
      suspenseAudioRef.current.currentTime = 0;
      suspenseAudioRef.current = null;
    }
  };

  const startSuspenseMusic = (playbackRate = 0.95, volume = 0.22) => {
    stopSuspenseMusic();
    try {
      const audio = new Audio('/sounds/c4_beep2.wav');
      audio.loop = true;
      audio.playbackRate = playbackRate;
      audio.volume = volume;
      audio.play();
      suspenseAudioRef.current = audio;
    } catch (error) {
      // Ignore audio errors to avoid blocking the quiz flow.
    }
  };

  const playExplosionSound = () => {
    try {
      const audio = new Audio('/sounds/c4_explode1.wav');
      audio.currentTime = 0;
      audio.volume = 0.85;
      audio.play();
    } catch (error) {
      // Ignore audio errors to avoid blocking the quiz flow.
    }
  };

  const playCelebrationSound = () => {
    try {
      const audio = new Audio('/sounds/acert.mp3');
      audio.currentTime = 0;
      audio.volume = 0.55;
      audio.play();
    } catch (error) {
      // Ignore audio errors to avoid blocking the quiz flow.
    }
  };

  const playUpperSound = () => {
    try {
      const audio = new Audio('/sounds/Upper.mp3');
      audio.currentTime = 0;
      audio.volume = 0.65;
      audio.play();
    } catch (error) {
      // Ignore audio errors to avoid blocking the quiz flow.
    }
  };

  const playDeathTaserSound = () => {
    try {
      const audio = new Audio('/sounds/death_taser_m_01.wav');
      audio.currentTime = 0;
      audio.volume = 0.45;
      audio.play();
    } catch (error) {
      // Ignore audio errors to avoid blocking the quiz flow.
    }
  };

  const clearPrizeTimeouts = () => {
    prizeTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    prizeTimeoutsRef.current = [];
  };

  const questions = [
    {
      id: 1,
      question: 'Com quantas kills o jogador de Counter-Strike Olofmeinster ganhou o major?',
      options: [235, 567, 1802, 3614],
      image: olofImage,
    },
    {
      id: 2,
      question: 'Em qual dia da semana foi criado o mapa Dust 2?',
      options: ['segunda-feira', 'terça-feira', 'quinta-feira', 'domingo'],
      image: dustImage,
    },
    {
      id: 3,
      question: 'Quantas partidas de CS o FalleN já jogou?',
      options: [1262, 2412, 3603, 4801],
      image: follenImage,
    },
    {
      id: 4,
      question: 'Quantas mortes Taco teve até ganhar o primeiro major?',
      options: [312, 648, 1045, 1702],
      image: tacoImage,
    },
    {
      id: 5,
      question: 'Quantas vezes o Romanele limpou seu monitor desde o último dormidão?',
      options: [1200000, 3400000, 7800000, 12500000],
      image: romaImage,
    },
  ];

  useEffect(() => {
    return () => {
      if (finalQuestionTimeoutRef.current) {
        clearTimeout(finalQuestionTimeoutRef.current);
      }
      clearPrizeTimeouts();
      stopSuspenseMusic();
    };
  }, []);

  const handleStartQuiz = () => {
    if (finalQuestionTimeoutRef.current) {
      clearTimeout(finalQuestionTimeoutRef.current);
    }
    clearPrizeTimeouts();
    stopSuspenseMusic();
    setQuizStarted(true);
    setCurrentQuestion(0);
    setSelectedAnswer(null);
    setShowFeedback(false);
    setFakeCorrectAnswer(null);
    setShowLastChancePrompt(false);
    setShowPrizeScene(false);
    setIsExploding(false);
    setShowFinalMessage(false);
  };

  const handleAnswerSelect = (answer) => {
    if (showFeedback) return;
    setSelectedAnswer(answer);
    playZoomSound();
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null || showFeedback) return;

    const question = questions[currentQuestion];
    const isLastQuestion = currentQuestion === questions.length - 1;

    if (isLastQuestion) {
      playUpperSound();
      setFakeCorrectAnswer(selectedAnswer);
      finalQuestionTimeoutRef.current = setTimeout(() => {
        setShowFeedback(false);
        setSelectedAnswer(null);
        setFakeCorrectAnswer(null);
        setShowPrizeScene(true);
        setShowFinalMessage(false);
        setIsExploding(false);
        startSuspenseMusic();
      }, 4000);
    } else {
      const availableFakeCorrectOptions = question.options.filter(
        (option) => option !== selectedAnswer
      );
      const randomFakeCorrect =
        availableFakeCorrectOptions[
          Math.floor(Math.random() * availableFakeCorrectOptions.length)
        ];

      playShotSound();
      playDeathTaserSound();
      setFakeCorrectAnswer(randomFakeCorrect);
    }

    setShowFeedback(true);
  };

  const handleNextChance = () => {
    if (!showFeedback) return;

    const isLastQuestion = currentQuestion === questions.length - 1;
    const isBeforeLastQuestion = currentQuestion === questions.length - 2;

    if (isLastQuestion) {
      setShowFeedback(false);
      setSelectedAnswer(null);
      setFakeCorrectAnswer(null);
      setShowPrizeScene(true);
      setShowFinalMessage(false);
      setIsExploding(false);
      startSuspenseMusic();
      return;
    }

    if (isBeforeLastQuestion) {
      setShowFeedback(false);
      setSelectedAnswer(null);
      setFakeCorrectAnswer(null);
      setShowLastChancePrompt(true);
      startSuspenseMusic(0.9, 0.3);
      return;
    }

    setCurrentQuestion((prev) => prev + 1);
    setSelectedAnswer(null);
    setShowFeedback(false);
    setFakeCorrectAnswer(null);
  };

  const handleStartLastQuestion = () => {
    setShowLastChancePrompt(false);
    stopSuspenseMusic();
    setCurrentQuestion((prev) => Math.min(prev + 1, questions.length - 1));
  };

  const handleClaimPrize = () => {
    if (isExploding || showFinalMessage) return;

    clearPrizeTimeouts();
    startSuspenseMusic(1.45, 0.45);

    const explosionTimeout = setTimeout(() => {
      setIsExploding(true);
      playExplosionSound();
    }, 1200);

    const revealTimeout = setTimeout(() => {
      stopSuspenseMusic();
      setIsExploding(false);
      setShowFinalMessage(true);
      playCelebrationSound();
    }, 2800);

    prizeTimeoutsRef.current.push(explosionTimeout, revealTimeout);
  };

  if (!quizStarted) {
    return (
      <div className="quizcs-container quizcs-container-start">
        <div className="quiz-start-screen">
          <div className="start-screen-card">
            <p className="start-label">Desafio CS2</p>
            <h1 className="start-title">Quiz CS</h1>
            <p className="start-description">
              Responda este quiz e, dependendo do seu desempenho, você poderá ganhar um prêmio especial.
            </p>
            <button className="start-button" onClick={handleStartQuiz}>
              Começar Quiz
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showPrizeScene) {
    return (
      <div className="quizcs-container">
        <div className={`prize-scene ${isExploding ? 'is-exploding' : ''}`}>
          {!showFinalMessage ? (
            <>
              <h2 className="prize-title">Prêmio desbloqueado</h2>
              <p className="prize-subtitle">
               
              </p>
              <button className="prize-button" onClick={handleClaimPrize}>
                Clique aqui para obter seu prêmio
              </button>
            </>
          ) : (
            <div className="final-message-card">
              <div className="celebration-layer" aria-hidden="true">
                <img src={romaSemFundoImage} alt="" className="rominha rominha-1" />
                <img src={romaSemFundoImage} alt="" className="rominha rominha-2" />
                <img src={romaSemFundoImage} alt="" className="rominha rominha-3" />
                <img src={romaSemFundoImage} alt="" className="rominha rominha-4" />
                <img src={romaSemFundoImage} alt="" className="rominha rominha-5" />
                <img src={romaSemFundoImage} alt="" className="rominha rominha-6" />
                <img src={romaSemFundoImage} alt="" className="rominha rominha-7" />
                <img src={romaSemFundoImage} alt="" className="rominha rominha-8" />
                <img src={romaSemFundoImage} alt="" className="rominha rominha-9" />
                <img src={romaSemFundoImage} alt="" className="rominha rominha-10" />
                <img src={romaSemFundoImage} alt="" className="rominha rominha-11" />
                <img src={romaSemFundoImage} alt="" className="rominha rominha-12" />
                <span className="spark spark-1"></span>
                <span className="spark spark-2"></span>
                <span className="spark spark-3"></span>
                <span className="spark spark-4"></span>
                <span className="spark spark-5"></span>
              </div>
              <img
                src={glovesImage}
                alt="Olofortes Gloves"
                className="olofortes-image"
              />
              <p>Essa data não poderia passar batido.</p>
              <p>Um presente especial do clã Cegonheiros para Romanele.</p>
              <p>Abra sua Steam e aceite a troca.</p>
            </div>
          )}

          {isExploding && (
            <div className="explosion-overlay" aria-hidden="true">
              <span className="boom-text">BOOM</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (showLastChancePrompt) {
    return (
      <div className="quizcs-container">
        <div className="last-chance-scene">
          <p className="last-chance-label">Atenção</p>
          <h2 className="last-chance-title">Última chance</h2>
          <p className="last-chance-text">
            É a sua última chance de sair vencedor e receber um prêmio.
          </p>
          <p className="last-chance-text">
            Você está preparado para responder a última pergunta?
          </p>
          <button className="last-chance-button" onClick={handleStartLastQuestion}>
            SIM
          </button>
        </div>
      </div>
    );
  }

  const question = questions[currentQuestion];
  const isLastQuestion = currentQuestion === questions.length - 1;
  const lossRewards = [
    { image: butterImage, text: 'Que pena, você errou e não conseguiu ganhar a Butterfly Fade.' },
    { image: karambitImage, text: 'Que pena, você errou e não conseguiu ganhar a Karambit.' },
    { image: awpImage, text: 'Que pena, você errou e não conseguiu ganhar a AWP.' },
    { image: akImage, text: 'Que pena, você errou e não conseguiu ganhar a AK-47.' },
  ];
  const isWrongAnswer =
    showFeedback && !isLastQuestion && selectedAnswer !== null && fakeCorrectAnswer !== selectedAnswer;
  const activeLossReward = isWrongAnswer ? lossRewards[currentQuestion] : null;

  return (
    <div className="quizcs-container">
      <div className="quiz-content">
        <div className="question-section">
          <div className="question-image-wrap">
            <img
              src={question.image}
              alt="Imagem da pergunta"
              className="question-image"
            />
            {activeLossReward && (
              <div className="loss-overlay">
                <img
                  src={activeLossReward.image}
                  alt="Prêmio perdido"
                  className="loss-overlay-image"
                />
                <p className="loss-overlay-text">{activeLossReward.text}</p>
              </div>
            )}
          </div>
          <h2 className="question-text">{question.question}</h2>
        </div>

        <div className="options-section">
          {question.options.map((option, index) => (
            <button
              key={index}
              className={`option-button ${
                selectedAnswer === option ? 'selected' : ''
              } ${
                showFeedback && !isLastQuestion && selectedAnswer === option ? 'wrong-fixed' : ''
              } ${
                showFeedback && fakeCorrectAnswer === option ? 'fake-correct-blink' : ''
              }`}
              onClick={() => handleAnswerSelect(option)}
              disabled={showFeedback}
            >
              {option}
            </button>
          ))}
        </div>

        <div className={`button-section ${isWrongAnswer ? 'error-highlight' : ''}`}>
          <button
            className={`submit-button ${showFeedback && !isLastQuestion ? 'error-state' : ''}`}
            onClick={handleSubmitAnswer}
            disabled={selectedAnswer === null || showFeedback}
          >
            {showFeedback ? (isLastQuestion ? 'ACERTOU!' : 'ERROU FEIO!') : 'Confirmar Resposta'}
          </button>
        </div>

        {showFeedback && !isLastQuestion && (
          <div className="button-section next-chance-section">
            <button className="next-chance-button" onClick={handleNextChance}>
              Próxima pergunta - nova chance
            </button>
          </div>
        )}

        <div className="progress-info">
          Pergunta {currentQuestion + 1} de {questions.length}
        </div>
      </div>
    </div>
  );
}

export default QuizCS;
