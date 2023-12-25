import { readFile } from 'fs/promises';
import internal from 'stream';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import { Context, Schema, Service } from 'koishi';

declare module 'koishi' {
    interface Context {
        'server.temp': TempService;
    }
}

export const name = 'server-temp-bilibili';

export interface Config {
    method: 'dynamic' | 'article';
    cookie: {
        bili_jct: string;
        SESSDATA: string;
    };
}

export const Config: Schema<Config> = Schema.object({
    method: Schema.union([
        Schema.const('dynamic').description('动态(i0.hdslb.com)'),
        Schema.const('article').description('文章(article.biliimg.com)'),
    ]).description('上传方式'),
    cookie: Schema.object({
        bili_jct: Schema.string().required().role('secret'),
        SESSDATA: Schema.string().required().role('secret'),
    }).description('Cookie'),
});

export class TempService extends Service {
    protected method: 'dynamic' | 'article';
    protected cookie: { bili_jct: string; SESSDATA: string };

    constructor(ctx: Context, config: Config) {
        super(ctx, 'server.temp', true);
        this.cookie = config.cookie;
        this.method = config.method || 'dynamic';
    }

    async create(data: Buffer | string | internal.Readable): Promise<{ url: string }> {
        if (typeof data === 'string') {
            if (new URL(data).protocol === 'file:') {
                data = await readFile(fileURLToPath(data));
            } else {
                data = await this.ctx.http.get(data, { responseType: 'stream' });
            }
        }
        const payload = new FormData();
        let url = 'https://api.bilibili.com';
        switch (this.method) {
            case 'dynamic':
                payload.append('file_up', data, { filename: 'image.jpg' });
                url += '/x/dynamic/feed/draw/upload_bfs';
                break;
            case 'article':
                payload.append('binary', data, { filename: 'image.jpg' });
                url += '/x/article/creative/article/upcover';
                break;
            default:
                throw new Error('未知的上传方式');
        }
        payload.append('csrf', this.cookie.bili_jct);
        const result = await this.ctx.http.post(url, payload, { headers: { cookie: `SESSDATA=${this.cookie.SESSDATA}` } });
        if (result.code === 0) {
            return { url: result.data.url || result.data.image_url };
        }
        throw new Error(result.message);
    }
}

export function apply(ctx: Context, config: Config) {
    ctx.plugin(TempService, config);
}
