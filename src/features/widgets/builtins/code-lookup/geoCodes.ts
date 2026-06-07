export type GeoCodeRecord = {
  id: string;
  type: 'country' | 'city' | 'calling' | 'locale' | 'currency';
  code: string;
  zh: string;
  en: string;
  countryZh?: string;
  countryEn?: string;
  provinceZh?: string;
  aliases?: string[];
};

export const geoCodeRecords: GeoCodeRecord[] = [
  {id: 'country-cn', type: 'country', code: 'CN / CHN / 156', zh: '中国', en: 'China', aliases: ['PRC', '中华人民共和国', '+86']},
  {id: 'country-us', type: 'country', code: 'US / USA / 840', zh: '美国', en: 'United States', aliases: ['America', '+1']},
  {id: 'country-jp', type: 'country', code: 'JP / JPN / 392', zh: '日本', en: 'Japan', aliases: ['Nippon', '+81']},
  {id: 'country-kr', type: 'country', code: 'KR / KOR / 410', zh: '韩国', en: 'South Korea', aliases: ['Korea', '+82']},
  {id: 'country-gb', type: 'country', code: 'GB / GBR / 826', zh: '英国', en: 'United Kingdom', aliases: ['UK', '+44']},
  {id: 'country-de', type: 'country', code: 'DE / DEU / 276', zh: '德国', en: 'Germany', aliases: ['Deutschland', '+49']},
  {id: 'country-fr', type: 'country', code: 'FR / FRA / 250', zh: '法国', en: 'France', aliases: ['+33']},
  {id: 'country-sg', type: 'country', code: 'SG / SGP / 702', zh: '新加坡', en: 'Singapore', aliases: ['+65']},
  {id: 'country-au', type: 'country', code: 'AU / AUS / 036', zh: '澳大利亚', en: 'Australia', aliases: ['+61']},
  {id: 'country-ca', type: 'country', code: 'CA / CAN / 124', zh: '加拿大', en: 'Canada', aliases: ['+1']},
  {id: 'country-in', type: 'country', code: 'IN / IND / 356', zh: '印度', en: 'India', aliases: ['+91']},
  {id: 'country-br', type: 'country', code: 'BR / BRA / 076', zh: '巴西', en: 'Brazil', aliases: ['+55']},
  {id: 'country-ru', type: 'country', code: 'RU / RUS / 643', zh: '俄罗斯', en: 'Russia', aliases: ['+7']},
  {id: 'country-hk', type: 'country', code: 'HK / HKG / 344', zh: '中国香港', en: 'Hong Kong', aliases: ['香港', '+852']},
  {id: 'country-tw', type: 'country', code: 'TW / TWN / 158', zh: '中国台湾', en: 'Taiwan', aliases: ['台湾', '+886']},

  {id: 'city-beijing', type: 'city', code: '110000', zh: '北京', en: 'Beijing', countryZh: '中国', countryEn: 'China', provinceZh: '北京市', aliases: ['010']},
  {id: 'city-shanghai', type: 'city', code: '310000', zh: '上海', en: 'Shanghai', countryZh: '中国', countryEn: 'China', provinceZh: '上海市', aliases: ['021']},
  {id: 'city-guangzhou', type: 'city', code: '440100', zh: '广州', en: 'Guangzhou', countryZh: '中国', countryEn: 'China', provinceZh: '广东省', aliases: ['020']},
  {id: 'city-shenzhen', type: 'city', code: '440300', zh: '深圳', en: 'Shenzhen', countryZh: '中国', countryEn: 'China', provinceZh: '广东省', aliases: ['0755']},
  {id: 'city-hangzhou', type: 'city', code: '330100', zh: '杭州', en: 'Hangzhou', countryZh: '中国', countryEn: 'China', provinceZh: '浙江省', aliases: ['0571']},
  {id: 'city-chengdu', type: 'city', code: '510100', zh: '成都', en: 'Chengdu', countryZh: '中国', countryEn: 'China', provinceZh: '四川省', aliases: ['028']},
  {id: 'city-wuhan', type: 'city', code: '420100', zh: '武汉', en: 'Wuhan', countryZh: '中国', countryEn: 'China', provinceZh: '湖北省', aliases: ['027']},
  {id: 'city-xian', type: 'city', code: '610100', zh: '西安', en: "Xi'an", countryZh: '中国', countryEn: 'China', provinceZh: '陕西省', aliases: ['029', 'xian']},
  {id: 'city-nanjing', type: 'city', code: '320100', zh: '南京', en: 'Nanjing', countryZh: '中国', countryEn: 'China', provinceZh: '江苏省', aliases: ['025']},
  {id: 'city-suzhou', type: 'city', code: '320500', zh: '苏州', en: 'Suzhou', countryZh: '中国', countryEn: 'China', provinceZh: '江苏省', aliases: ['0512']},
  {id: 'city-new-york', type: 'city', code: 'NYC / IATA: NYC', zh: '纽约', en: 'New York City', countryZh: '美国', countryEn: 'United States', aliases: ['New York', '212']},
  {id: 'city-los-angeles', type: 'city', code: 'LAX / IATA: LAX', zh: '洛杉矶', en: 'Los Angeles', countryZh: '美国', countryEn: 'United States', aliases: ['LA', '213']},
  {id: 'city-london', type: 'city', code: 'LON / IATA: LON', zh: '伦敦', en: 'London', countryZh: '英国', countryEn: 'United Kingdom', aliases: ['020']},
  {id: 'city-tokyo', type: 'city', code: 'TYO / IATA: TYO', zh: '东京', en: 'Tokyo', countryZh: '日本', countryEn: 'Japan', aliases: ['03']},
  {id: 'city-singapore', type: 'city', code: 'SIN / IATA: SIN', zh: '新加坡', en: 'Singapore', countryZh: '新加坡', countryEn: 'Singapore', aliases: ['+65']},

  {id: 'calling-86', type: 'calling', code: '+86', zh: '中国电话区号', en: 'China calling code', countryZh: '中国', countryEn: 'China'},
  {id: 'calling-1', type: 'calling', code: '+1', zh: '北美电话区号', en: 'NANP calling code', countryZh: '美国/加拿大', countryEn: 'United States / Canada'},
  {id: 'calling-81', type: 'calling', code: '+81', zh: '日本电话区号', en: 'Japan calling code', countryZh: '日本', countryEn: 'Japan'},
  {id: 'locale-zh-cn', type: 'locale', code: 'zh-CN', zh: '简体中文（中国大陆）', en: 'Chinese Simplified, China', countryZh: '中国', countryEn: 'China'},
  {id: 'locale-en-us', type: 'locale', code: 'en-US', zh: '英语（美国）', en: 'English, United States', countryZh: '美国', countryEn: 'United States'},
  {id: 'locale-ja-jp', type: 'locale', code: 'ja-JP', zh: '日语（日本）', en: 'Japanese, Japan', countryZh: '日本', countryEn: 'Japan'},
  {id: 'currency-cny', type: 'currency', code: 'CNY / RMB', zh: '人民币', en: 'Chinese Yuan', countryZh: '中国', countryEn: 'China'},
  {id: 'currency-usd', type: 'currency', code: 'USD', zh: '美元', en: 'United States Dollar', countryZh: '美国', countryEn: 'United States'},
  {id: 'currency-jpy', type: 'currency', code: 'JPY', zh: '日元', en: 'Japanese Yen', countryZh: '日本', countryEn: 'Japan'},
  {id: 'currency-eur', type: 'currency', code: 'EUR', zh: '欧元', en: 'Euro', countryZh: '欧元区', countryEn: 'Eurozone'},
];

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '');

export function searchGeoCodes(query: string, limit = 8): GeoCodeRecord[] {
  const q = normalize(query);
  if (!q) return geoCodeRecords.slice(0, limit);

  const scored = geoCodeRecords
      .map((record) => {
        const haystacks = [
          record.code,
          record.zh,
          record.en,
          record.countryZh || '',
          record.countryEn || '',
          record.provinceZh || '',
          ...(record.aliases || []),
        ].map(normalize);
        let score = 0;
        for (const text of haystacks) {
          if (!text) continue;
          if (text === q) score = Math.max(score, 100);
          else if (text.startsWith(q)) score = Math.max(score, 72);
          else if (text.includes(q)) score = Math.max(score, 48);
        }
        return {record, score};
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.record.zh.localeCompare(b.record.zh, 'zh-CN'));

  return scored.slice(0, limit).map((item) => item.record);
}

export const getTypeLabel = (type: GeoCodeRecord['type']) => {
  if (type === 'country') return '国家';
  if (type === 'city') return '城市';
  if (type === 'calling') return '电话';
  if (type === 'locale') return '语言';
  return '货币';
};
