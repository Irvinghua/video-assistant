declare module 'markmap-lib' {
    export class Transformer {
        transform(markdown: string): { root: any; features: any }
    }
}
