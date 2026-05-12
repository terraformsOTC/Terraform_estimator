'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const Context = createContext([false, () => {}]);

export function MoneySwordProvider({ children }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('moneySword') === 'true') setOn(true);
  }, []);

  function toggle() {
    setOn(prev => {
      const next = !prev;
      localStorage.setItem('moneySword', String(next));
      return next;
    });
  }

  return <Context.Provider value={[on, toggle]}>{children}</Context.Provider>;
}

export function useMoneySword() {
  return useContext(Context);
}
