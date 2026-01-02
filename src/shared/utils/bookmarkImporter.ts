// src/utils/bookmarkImporter.ts
import {v4 as uuidv4} from 'uuid';

export interface ImportResult {
    success: boolean;
    groups: any[]; // 解析出的分组数组
    totalCount: number; // 书签总数
    message?: string;
}

/**
 * 解析 Netscape 格式的书签 HTML 字符串
 * @param htmlContent 读取到的 HTML 文件内容
 */
export const parseBookmarkContent = (htmlContent: string): ImportResult => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');

        // 查找所有包含书签的文件夹 (H3 标签)
        const folders = doc.querySelectorAll('dt > h3');

        const parsedGroups: any[] = [];
        let bookmarkCount = 0;

        folders.forEach((folder) => {
            const folderName = folder.textContent || '导入的文件夹';

            // 在标准格式中，书签列表 <DL> 通常紧跟在 <H3> 后面
            const dlList = folder.nextElementSibling;

            if (dlList && dlList.tagName === 'DL') {
                const links = dlList.querySelectorAll('a');

                if (links.length > 0) {
                    // 创建新的分组结构
                    const newGroup = {
                        id: uuidv4(),
                        title: folderName,
                        icon: 'Folder', // 默认图标
                        // 保持与 MainGrid 兼容的 items 结构
                        items: [] as any[]
                    };

                    links.forEach((link) => {
                        newGroup.items.push({
                            id: uuidv4(),
                            title: link.textContent || '未命名',
                            url: link.getAttribute('href') || '',
                            // 强制使用自动模式，获取高清图标
                            iconType: 'auto',
                            iconValue: '',
                            bgColor: '#3b82f6' // 默认蓝色背景
                        });
                        bookmarkCount++;
                    });

                    parsedGroups.push(newGroup);
                }
            }
        });

        if (parsedGroups.length === 0) {
            return {success: false, groups: [], totalCount: 0, message: '未找到有效的书签数据'};
        }

        return {
            success: true,
            groups: parsedGroups,
            totalCount: bookmarkCount
        };

    } catch (e) {
        console.error('Bookmark parsing failed:', e);
        return {success: false, groups: [], totalCount: 0, message: '文件解析发生错误'};
    }
};