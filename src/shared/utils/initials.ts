export const getSmartInitials = (str: string) => {
    const clean = String(str || '').trim().replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
    if (!clean) return String(str || 'A').substring(0, 1).toUpperCase();

    if (/[\u4e00-\u9fa5]/.test(clean)) return clean.substring(0, 2); // 中文取前2
    return clean.substring(0, 4).toUpperCase(); // 英文取前4
};
