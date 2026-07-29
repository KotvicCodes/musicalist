// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')

const { escapeHtml, textToArray } = require('../src/text.js')

//! Escaping
test('escapes every character that could break out of markup', () => {
    assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;')
    assert.equal(escapeHtml('AT&T'), 'AT&amp;T')
    assert.equal(escapeHtml(`"quoted" 'single'`), '&quot;quoted&quot; &#39;single&#39;')
})

test('escapes the ampersand first so entities are not double-broken', () => {
    assert.equal(escapeHtml('&lt;'), '&amp;lt;')
})

test('coerces non-strings', () => {
    assert.equal(escapeHtml(42), '42')
    assert.equal(escapeHtml(null), 'null')
})

//! Song List Parsing
test('splits on commas and trims', () => {
    assert.deepEqual(textToArray('Bohemian Rhapsody, Billie Jean'), ['Bohemian Rhapsody', 'Billie Jean'])
})

test('tolerates line breaks and stray whitespace', () => {
    assert.deepEqual(textToArray('  One  ,\n  Two  ,\n\n  Three  '), ['One', 'Two', 'Three'])
})

test('drops empty entries from trailing or doubled commas', () => {
    assert.deepEqual(textToArray('One,,Two,'), ['One', 'Two'])
})

test('removes duplicates', () => {
    assert.deepEqual(textToArray('One, Two, One'), ['One', 'Two'])
})

test('returns an empty list for empty input', () => {
    assert.deepEqual(textToArray(''), [])
    assert.deepEqual(textToArray('   \n  '), [])
    assert.deepEqual(textToArray(null), [])
    assert.deepEqual(textToArray(undefined), [])
})

//! Separator Choice
// A comma is as likely to sit inside a title as between two, so the caller can
// say which it meant and auto reads the text when it does not.
test('auto keeps a title that contains a comma whole', () => {
    assert.deepEqual(textToArray('Hey, Soul Sister\nHello, Goodbye'), [
        'Hey, Soul Sister',
        'Hello, Goodbye'
    ])
})

test('an explicit comma splits a title that contains one', () => {
    assert.deepEqual(textToArray('Hey, Soul Sister\nBillie Jean', 'comma'), [
        'Hey',
        'Soul Sister\nBillie Jean'
    ])
})

test('an explicit new line ignores every comma', () => {
    assert.deepEqual(textToArray('One, Two\nThree', 'newline'), ['One, Two', 'Three'])
})

test('splits on semicolons when asked', () => {
    assert.deepEqual(textToArray('Hey, Soul Sister; Hello, Goodbye', 'semicolon'), [
        'Hey, Soul Sister',
        'Hello, Goodbye'
    ])
})

test('falls back to reading the text when handed a separator it does not know', () => {
    assert.deepEqual(textToArray('One, Two', 'pipe'), ['One', 'Two'])
})

test('still removes duplicates and empties whichever separator is used', () => {
    assert.deepEqual(textToArray('One\n\nTwo\nOne\n', 'newline'), ['One', 'Two'])
    assert.deepEqual(textToArray('One;;Two;One', 'semicolon'), ['One', 'Two'])
})
