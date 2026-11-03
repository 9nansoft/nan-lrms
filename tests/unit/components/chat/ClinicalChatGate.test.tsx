// The floating chat pill must follow the server feature flag
// (CLINICAL_CHAT_ENABLED) and, when on, reserve room so it never covers content.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/chat/ClinicalChatPanel', () => ({
  ClinicalChatPanel: ({ mode }: { mode: string }) => <div data-testid="chat-panel">{mode}</div>,
}));

import { ClinicalChatGate, chatReserveClass } from '@/components/chat/ClinicalChatGate';

afterEach(() => vi.unstubAllEnvs());

describe('ClinicalChatGate', () => {
  it('renders nothing and reserves no space when the flag is off', () => {
    vi.stubEnv('CLINICAL_CHAT_ENABLED', 'false');
    render(<ClinicalChatGate mode="statistics" />);
    expect(screen.queryByTestId('chat-panel')).toBeNull();
    expect(chatReserveClass()).toBe('');
  });

  it('renders the panel and reserves bottom padding when the flag is on', () => {
    vi.stubEnv('CLINICAL_CHAT_ENABLED', 'true');
    render(<ClinicalChatGate mode="clinical" />);
    expect(screen.getByTestId('chat-panel')).toHaveTextContent('clinical');
    expect(chatReserveClass()).toMatch(/(^|\s)pb-\d+/);
  });
});
