import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { AssistantTextPart } from '@/services/reedy/ui/parts/TextPart';

afterEach(() => cleanup());

/**
 * agy (and other models) emit LaTeX delimiters in chat replies. Without
 * remark-math + rehype-katex those show as raw `$$…$$` in the bubble.
 */
describe('AssistantTextPart math', () => {
  it('renders display math from $$ delimiters as KaTeX', () => {
    render(
      <AssistantTextPart text='The relation: $$\text{Human} \longrightarrow (\text{Technology} - \text{World})$$' />,
    );

    const math = document.querySelector('.katex');
    expect(math).toBeTruthy();
    expect(screen.queryByText(/\$\$/)).toBeNull();
  });

  it('leaves ordinary prose alone', () => {
    render(<AssistantTextPart text='No formulas here.' />);
    expect(screen.getByText('No formulas here.')).toBeTruthy();
    expect(document.querySelector('.katex')).toBeNull();
  });
});
