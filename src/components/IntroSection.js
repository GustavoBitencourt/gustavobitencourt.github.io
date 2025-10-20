import React from 'react';

const IntroSection = ({ t }) => {
  return (
    <div className="intro-text-container">
      <div className="intro-text">
        <span>{t('hello')}</span><br />
        <span>{t('i-am')} </span>
        <span className="highlight">Gustavo Bitencourt</span>,<br />
        <span>{t('role')}</span>
      </div>
    </div>
  );
};

export default IntroSection;