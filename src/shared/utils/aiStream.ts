type ChatCompletionChunk = Record<string, any>;

type StreamReadOptions = {
    onContent: (content: string) => void;
};

const extractDeltaContent = (payload: ChatCompletionChunk) => {
    const choice = payload.choices?.[0];
    const content =
        choice?.delta?.content ??
        choice?.message?.content ??
        choice?.text ??
        payload.delta ??
        payload.message?.content ??
        payload.response ??
        payload.content ??
        '';

    return typeof content === 'string' ? content : '';
};

const extractFullContent = (payload: ChatCompletionChunk) => {
    const choice = payload.choices?.[0];
    const content =
        choice?.message?.content ??
        choice?.delta?.content ??
        choice?.text ??
        payload.message?.content ??
        payload.response ??
        payload.content ??
        '';

    return typeof content === 'string' ? content : '';
};

const parseJsonPayload = (raw: string) => {
    try {
        return JSON.parse(raw) as ChatCompletionChunk;
    } catch {
        return null;
    }
};

const readBufferedResponse = async (response: Response, options: StreamReadOptions) => {
    const text = await response.text();
    const payload = parseJsonPayload(text);
    const content = payload ? extractFullContent(payload) : text;
    if (content) options.onContent(content);
    return content;
};

export async function readChatCompletionStream(response: Response, options: StreamReadOptions) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json') && !contentType.includes('stream')) {
        return await readBufferedResponse(response, options);
    }

    const reader = response.body?.getReader();
    if (!reader) return await readBufferedResponse(response, options);

    const decoder = new TextDecoder('utf-8');
    let pendingLine = '';
    let fullContent = '';

    const consumePayload = (payloadText: string) => {
        const payloadRaw = payloadText.trim();
        if (!payloadRaw || payloadRaw === '[DONE]') return;

        const payload = parseJsonPayload(payloadRaw);
        if (!payload) return;

        const delta = extractDeltaContent(payload);
        if (!delta) return;

        fullContent += delta;
        options.onContent(fullContent);
    };

    const consumeLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) return;
        if (trimmed.startsWith('event:') || trimmed.startsWith('id:') || trimmed.startsWith('retry:')) return;

        if (trimmed.startsWith('data:')) {
            consumePayload(trimmed.slice(5));
            return;
        }

        consumePayload(trimmed);
    };

    while (true) {
        const {done, value} = await reader.read();
        if (done) break;

        pendingLine += decoder.decode(value, {stream: true});
        const lines = pendingLine.split(/\r?\n/);
        pendingLine = lines.pop() ?? '';

        for (const line of lines) consumeLine(line);
    }

    const tail = `${pendingLine}${decoder.decode()}`;
    if (tail) consumeLine(tail);

    return fullContent;
}
