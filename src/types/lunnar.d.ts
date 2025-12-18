declare module 'lunar-javascript' {
    export class Solar {
        static fromDate(date: Date): Solar;
        getLunar(): Lunar;
    }

    export class Lunar {
        getMonthInChinese(): string;
        getDayInChinese(): string;
        getYearInGanZhi(): string;
        getMonthInGanZhi(): string;
        getDayInGanZhi(): string;
        getDayYi(): string[];
        getDayJi(): string[];
    }
}