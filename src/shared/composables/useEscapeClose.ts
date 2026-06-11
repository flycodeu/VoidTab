import {onBeforeUnmount, type Ref} from 'vue';

type ActiveSource = Ref<boolean> | (() => boolean) | boolean;

type EscapeCloseEntry = {
    active: () => boolean;
    disabled: () => boolean;
    close: (event: KeyboardEvent) => void;
};

const stack: EscapeCloseEntry[] = [];
let isListening = false;

const resolve = (source: ActiveSource | undefined, fallback = false) => {
    if (typeof source === 'function') return source();
    if (source && typeof source === 'object' && 'value' in source) return Boolean(source.value);
    if (typeof source === 'boolean') return source;
    return fallback;
};

const handleEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' && event.key !== 'Esc') return;
    if (event.isComposing || event.defaultPrevented) return;

    const top = [...stack].reverse().find((entry) => entry.active() && !entry.disabled());
    if (!top) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    top.close(event);
};

const ensureListener = () => {
    if (isListening || typeof document === 'undefined') return;
    document.addEventListener('keydown', handleEscape, true);
    isListening = true;
};

const removeListenerIfIdle = () => {
    if (!isListening || stack.length > 0 || typeof document === 'undefined') return;
    document.removeEventListener('keydown', handleEscape, true);
    isListening = false;
};

export function useEscapeClose(
    active: ActiveSource,
    close: (event: KeyboardEvent) => void,
    options: { disabled?: ActiveSource } = {},
) {
    const entry: EscapeCloseEntry = {
        active: () => resolve(active),
        disabled: () => resolve(options.disabled),
        close,
    };

    stack.push(entry);
    ensureListener();

    onBeforeUnmount(() => {
        const index = stack.indexOf(entry);
        if (index >= 0) stack.splice(index, 1);
        removeListenerIfIdle();
    });
}
