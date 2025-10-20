import { useState, useEffect } from 'react';
import translations from '../utils/translations';

export const useLanguage = () => {
  const [currentLanguage, setCurrentLanguage] = useState('pt');

  useEffect(() => {
    // Verificar se há idioma salvo no localStorage
    const savedLanguage = localStorage.getItem('preferred-language');
    
    if (savedLanguage && translations[savedLanguage]) {
      setCurrentLanguage(savedLanguage);
    }
  }, []);

  const changeLanguage = (language) => {
    if (translations[language]) {
      setCurrentLanguage(language);
      localStorage.setItem('preferred-language', language);
    }
  };

  const t = (key) => {
    return translations[currentLanguage]?.[key] || key;
  };

  return { currentLanguage, changeLanguage, t };
};