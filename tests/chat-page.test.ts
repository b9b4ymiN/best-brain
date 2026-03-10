import { describe, expect, test } from 'bun:test';
import { renderChatPage } from '../src/chat/page.ts';

describe('chat page', () => {
  test('renders a browser-parseable client script', () => {
    const html = renderChatPage();
    const match = html.match(/<script>([\s\S]*)<\/script>/);
    expect(match).not.toBeNull();
    expect(() => new Function(match![1])).not.toThrow();
  });
});
