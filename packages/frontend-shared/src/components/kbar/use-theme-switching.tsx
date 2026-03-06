import { Priority, useRegisterActions } from 'kbar';
import { useTheme } from 'next-themes';

const useThemeSwitching = () => {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const themeAction = [
    {
      id: 'toggleTheme',
      name: 'Toggle Theme',
      shortcut: ['t', 't'],
      section: 'Theme',
      priority: Priority.LOW,
      perform: toggleTheme
    },
    {
      id: 'setLightTheme',
      name: 'Set Light Theme',
      section: 'Theme',
      priority: Priority.LOW,
      perform: () => setTheme('light')
    },
    {
      id: 'setDarkTheme',
      name: 'Set Dark Theme',
      section: 'Theme',
      priority: Priority.LOW,
      perform: () => setTheme('dark')
    }
  ];

  useRegisterActions(themeAction, [theme]);
};

export default useThemeSwitching;
