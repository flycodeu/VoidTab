export const groupIconNames = [
    'Folder', 'Briefcase', 'House', 'Star', 'Heart',
    'Coffee', 'Code', 'Terminal', 'GameController',
    'MusicNotes', 'Image', 'VideoCamera', 'ShoppingCart',
    'Airplane', 'Bug', 'Cpu', 'Lightning'
] as const;

export type GroupIconName = typeof groupIconNames[number];
