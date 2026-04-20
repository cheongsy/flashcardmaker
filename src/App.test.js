import { render, screen } from '@testing-library/react';
import App from './App';

test('renders flashcards UI', () => {
  render(<App />);
  expect(screen.getByLabelText(/chinese flashcards/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/pinyin answer input/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/chinese character/i)).toBeInTheDocument();
});
