import {nextTick, onBeforeUnmount, watch, type Ref} from 'vue';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusable(container: HTMLElement) {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((el) => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });
}

export function useFocusTrap(containerRef: Ref<HTMLElement | null>, active: Ref<boolean>) {
    let previousActiveElement: HTMLElement | null = null;

    const focusFirst = async () => {
        await nextTick();
        const container = containerRef.value;
        if (!container) return;

        previousActiveElement = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

        const [first] = getFocusable(container);
        (first || container).focus();
    };

    const releaseFocus = () => {
        previousActiveElement?.focus?.();
        previousActiveElement = null;
    };

    const onKeydown = (event: KeyboardEvent) => {
        if (!active.value || event.key !== 'Tab') return;

        const container = containerRef.value;
        if (!container) return;

        const focusable = getFocusable(container);
        if (focusable.length === 0) {
            event.preventDefault();
            container.focus();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    watch(active, (isActive) => {
        if (isActive) {
            document.addEventListener('keydown', onKeydown, true);
            void focusFirst();
        } else {
            document.removeEventListener('keydown', onKeydown, true);
            releaseFocus();
        }
    }, {immediate: true});

    onBeforeUnmount(() => {
        document.removeEventListener('keydown', onKeydown, true);
        releaseFocus();
    });
}
