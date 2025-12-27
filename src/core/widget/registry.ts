// src/core/widgets/registry.ts
import WeatherWidget from '../../components/widgets/WeatherWidget.vue';
import GitHubTrendsWidget from '../../components/widgets/GitHubTrendsWidget.vue';
import SystemWidget from '../../components/widgets/SystemWidget.vue';
import RSSWidget from '../../components/widgets/RSSWidget.vue';

export type WidgetId = 'weather' | 'github' | 'system' | 'rss';

export const widgetRegistry: Record<string, any> = {
    weather: WeatherWidget,
    github: GitHubTrendsWidget,
    system: SystemWidget,
    rss: RSSWidget
};

export function getWidgetComponent(id: string) {
    return widgetRegistry[id] ?? null;
}
