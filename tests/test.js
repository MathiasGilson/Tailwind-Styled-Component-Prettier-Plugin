const prettier = require('prettier')
const path = require('path')

function format(str, options = {}) {
    return prettier
        .format(str, {
            pluginSearchDirs: [__dirname], // disable plugin autoload
            plugins: [path.resolve(__dirname, '..')],
            semi: false,
            singleQuote: true,
            printWidth: 9999,
            parser: 'html',
            ...options
        })
        .trim()
}

let javascript = [
    [
        `;<div className={classNames('sm:block flex, text-sm text-blue-400', condition && 'text-orange-500')} />`,
        `;<div className={classNames('sm:block flex', 'text-sm text-blue-400', condition && 'text-orange-500')} />`
    ]
]

let tests = {
    babel: javascript,
    typescript: javascript,
    'babel-ts': javascript,
    flow: javascript,
    'babel-flow': javascript,
    espree: javascript,
    meriyah: javascript
}

describe('parsers', () => {
    for (let parser in tests) {
        test(parser, () => {
            for (let [input, expected] of tests[parser]) {
                expect(format(input, { parser })).toEqual(expected)
            }
        })
    }
})
