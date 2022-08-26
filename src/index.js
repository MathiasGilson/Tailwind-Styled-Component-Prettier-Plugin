import prettier from 'prettier'
import prettierParserBabel from 'prettier/parser-babel'
import prettierParserEspree from 'prettier/parser-espree'
import prettierParserMeriyah from 'prettier/parser-meriyah'
import prettierParserFlow from 'prettier/parser-flow'
import prettierParserTypescript from 'prettier/parser-typescript'
import { createContext as createContextFallback } from 'tailwindcss/lib/lib/setupContextUtils'
import { generateRules as generateRulesFallback } from 'tailwindcss/lib/lib/generateRules'
import resolveConfigFallback from 'tailwindcss/resolveConfig'

import * as path from 'path'
import requireFrom from 'import-from'
import requireFresh from 'import-fresh'
import objectHash from 'object-hash'

import escalade from 'escalade/sync'

import tailwindGroupClasses from './tailwindGroupClasses'

const tailwindGroupClassesNames = Object.keys(tailwindGroupClasses)

let contextMap = new Map()

function sortClasses(classStr) {
    if (typeof classStr !== 'string' || classStr === '') {
        return classStr
    }

    // Ignore class attributes containing `{{`, to match Prettier behaviour:
    // https://github.com/prettier/prettier/blob/main/src/language-html/embed.js#L83-L88
    if (classStr.includes('{{')) {
        return classStr
    }

    let parts = classStr.split(/(\s+)/)
    let classes = parts.filter((_, i) => i % 2 === 0)

    if (classes[classes.length - 1] === '') {
        classes.pop()
    }

    const sortedClasses = classes.reduce((acc, className) => {
        // return name of the group the class belongs to
        let groupName = tailwindGroupClassesNames.find((groupName) =>
            tailwindGroupClasses[groupName].find((keyword) => className.includes(keyword))
        )

        if (!groupName) groupName = 'other'

        return { ...acc, [groupName]: `${acc[groupName] ?? ''} ${className}` }
    }, {})

    return tailwindGroupClassesNames
        .map((groupName) => sortedClasses[groupName]?.trim())
        .filter(Boolean)
        .toString()
}

function createParser(original, transform) {
    return {
        ...original,
        parse(text, parsers, options = {}) {
            let ast = original.parse(text, parsers, options)
            let tailwindConfigPath = '__default__'
            let tailwindConfig = {}
            let resolveConfig = resolveConfigFallback
            let createContext = createContextFallback
            let generateRules = generateRulesFallback

            let baseDir
            let prettierConfigPath = prettier.resolveConfigFile.sync(options.filepath)

            if (options.tailwindConfig) {
                baseDir = prettierConfigPath ? path.dirname(prettierConfigPath) : process.cwd()
                tailwindConfigPath = path.resolve(baseDir, options.tailwindConfig)
                tailwindConfig = requireFresh(tailwindConfigPath)
            } else {
                baseDir = prettierConfigPath
                    ? path.dirname(prettierConfigPath)
                    : options.filepath
                    ? path.dirname(options.filepath)
                    : process.cwd()
                let configPath
                try {
                    configPath = escalade(baseDir, (_dir, names) => {
                        if (names.includes('tailwind.config.js')) {
                            return 'tailwind.config.js'
                        }
                        if (names.includes('tailwind.config.cjs')) {
                            return 'tailwind.config.cjs'
                        }
                    })
                } catch {}
                if (configPath) {
                    tailwindConfigPath = configPath
                    tailwindConfig = requireFresh(configPath)
                }
            }

            try {
                resolveConfig = requireFrom(baseDir, 'tailwindcss/resolveConfig')
                createContext = requireFrom(baseDir, 'tailwindcss/lib/lib/setupContextUtils').createContext
                generateRules = requireFrom(baseDir, 'tailwindcss/lib/lib/generateRules').generateRules
            } catch {}

            // suppress "empty content" warning
            tailwindConfig.content = ['no-op']

            let context
            let existing = contextMap.get(tailwindConfigPath)
            let hash = objectHash(tailwindConfig)

            if (existing && existing.hash === hash) {
                context = existing.context
            } else {
                context = createContext(resolveConfig(tailwindConfig))
                contextMap.set(tailwindConfigPath, { context, hash })
            }

            transform(ast, { env: { context, generateRules, parsers, options } })
            return ast
        }
    }
}

function sortStringLiteral(node, { env }) {
    let result = sortClasses(node.value, { env })
    let didChange = result !== node.value
    node.value = result
    if (node.extra) {
        // JavaScript (StringLiteral)
        let raw = node.extra.raw
        node.extra = {
            ...node.extra,
            rawValue: result,
            raw: raw[0] + result + raw.slice(-1)
        }
    } else {
        // TypeScript (Literal)
        let raw = node.raw
        node.raw = raw[0] + result + raw.slice(-1)
    }
    return didChange
}

function isStringLiteral(node) {
    return node.type === 'StringLiteral' || (node.type === 'Literal' && typeof node.value === 'string')
}

function sortTemplateLiteral(node, { env }) {
    let didChange = false

    for (let i = 0; i < node.quasis.length; i++) {
        let quasi = node.quasis[i]
        let same = quasi.value.raw === quasi.value.cooked
        let originalRaw = quasi.value.raw
        let originalCooked = quasi.value.cooked

        quasi.value.raw = sortClasses(quasi.value.raw, {
            env,
            ignoreFirst: i > 0 && !/^\s/.test(quasi.value.raw),
            ignoreLast: i < node.expressions.length && !/\s$/.test(quasi.value.raw)
        })

        quasi.value.cooked = same
            ? quasi.value.raw
            : sortClasses(quasi.value.cooked, {
                  env,
                  ignoreFirst: i > 0 && !/^\s/.test(quasi.value.cooked),
                  ignoreLast: i < node.expressions.length && !/\s$/.test(quasi.value.cooked)
              })

        if (quasi.value.raw !== originalRaw || quasi.value.cooked !== originalCooked) {
            didChange = true
        }
    }

    return didChange
}

function transformJavaScript(ast, { env }) {
    visit(ast, {
        JSXAttribute(node) {
            if (!node.value) {
                return
            }
            if (['class', 'className'].includes(node.name.name)) {
                if (isStringLiteral(node.value)) {
                    return
                }
                if (
                    node.value.type === 'JSXExpressionContainer' &&
                    node.value.expression.type === 'CallExpression' &&
                    node.value.expression.callee.type === 'Identifier' &&
                    node.value.expression.callee.name === 'classNames'
                ) {
                    let classes = []
                    visit(node.value, (node) => {
                        // console.log(node)
                        if (node.type === 'LogicalExpression') return
                        if (isStringLiteral(node)) {
                            classes.concat(node.value)
                        }
                        // } else if (node.type === 'TemplateLiteral') {
                        //     sortTemplateLiteral(node, { env })
                        // }
                    })
                    const sortedClasses = sortClasses(node.value)
                    sortStringLiteral(node, { env })
                }
            }
        }
    })
}

export const options = {
    tailwindConfig: {
        type: 'string',
        category: 'Tailwind CSS',
        description: 'TODO'
    }
}

export const parsers = {
    babel: createParser(prettierParserBabel.parsers.babel, transformJavaScript),
    'babel-flow': createParser(prettierParserBabel.parsers['babel-flow'], transformJavaScript),
    flow: createParser(prettierParserFlow.parsers.flow, transformJavaScript),
    typescript: createParser(prettierParserTypescript.parsers.typescript, transformJavaScript),
    'babel-ts': createParser(prettierParserBabel.parsers['babel-ts'], transformJavaScript),
    espree: createParser(prettierParserEspree.parsers.espree, transformJavaScript),
    meriyah: createParser(prettierParserMeriyah.parsers.meriyah, transformJavaScript),
    __js_expression: createParser(prettierParserBabel.parsers.__js_expression, transformJavaScript)
}

// https://lihautan.com/manipulating-ast-with-javascript/
function visit(ast, callbackMap) {
    function _visit(node, parent, key, index, meta = {}) {
        if (typeof callbackMap === 'function') {
            if (callbackMap(node, parent, key, index, meta) === false) {
                return
            }
        } else if (node.type in callbackMap) {
            if (callbackMap[node.type](node, parent, key, index, meta) === false) {
                return
            }
        }

        const keys = Object.keys(node)
        for (let i = 0; i < keys.length; i++) {
            const child = node[keys[i]]
            if (Array.isArray(child)) {
                for (let j = 0; j < child.length; j++) {
                    if (child[j] !== null) {
                        _visit(child[j], node, keys[i], j, { ...meta })
                    }
                }
            } else if (typeof child?.type === 'string') {
                _visit(child, node, keys[i], i, { ...meta })
            }
        }
    }
    _visit(ast)
}
