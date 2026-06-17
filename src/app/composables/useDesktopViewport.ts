import {ref} from 'vue';

export function useDesktopViewport(query = '(min-width: 1024px)') {
    const isDesktopViewport = ref(true);
    let desktopViewportMql: MediaQueryList | null = null;

    const sync = () => {
        isDesktopViewport.value = desktopViewportMql?.matches ?? true;
    };

    const mount = () => {
        desktopViewportMql = window.matchMedia(query);
        sync();
        desktopViewportMql.addEventListener?.('change', sync);
    };

    const unmount = () => {
        desktopViewportMql?.removeEventListener?.('change', sync);
        desktopViewportMql = null;
    };

    return {
        isDesktopViewport,
        mount,
        unmount,
    };
}
