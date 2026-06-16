import type {RuntimeConfig, TerminalCommandMemo} from '../../../../core/config/types';
import {cloneDefaultTerminalCommands} from '../../../../core/config/terminalCommands';

export function ensureTerminalBufferState(runtime: RuntimeConfig) {
  if (!runtime.terminal_buffer) {
    runtime.terminal_buffer = {
      buffer: '',
      theme: 'standard',
      activeCategory: 'all',
      commands: cloneDefaultTerminalCommands(),
    };
  }

  runtime.terminal_buffer.buffer ||= '';
  runtime.terminal_buffer.theme ||= 'standard';
  runtime.terminal_buffer.activeCategory ||= 'all';

  if (!Array.isArray(runtime.terminal_buffer.commands) || runtime.terminal_buffer.commands.length === 0) {
    runtime.terminal_buffer.commands = cloneDefaultTerminalCommands();
  }

  return runtime.terminal_buffer;
}

export function createCommandMemo(input: {
  title: string;
  command: string;
  category: string;
  description?: string;
}): TerminalCommandMemo {
  const now = Date.now();
  return {
    id: `cmd_${now}_${Math.random().toString(36).slice(2, 7)}`,
    title: input.title.trim(),
    command: input.command.trim(),
    category: input.category || 'note',
    description: input.description?.trim() || '',
    createdAt: now,
    updatedAt: now,
  };
}

export function touchCommandMemo(command: TerminalCommandMemo): TerminalCommandMemo {
  return {
    ...command,
    updatedAt: Date.now(),
  };
}
