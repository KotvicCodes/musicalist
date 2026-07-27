// SPDX-FileCopyrightText: 2025-2026 Kotvič
// SPDX-License-Identifier: GPL-3.0-or-later

const test = require('node:test')
const assert = require('node:assert/strict')

const { isSafeExternalUrl } = require('../src/url.js')

//! Allowed
test('allows the web schemes a link can legitimately need', () => {
    assert.equal(isSafeExternalUrl('https://github.com/KotvicCodes/musicalist#readme'), true)
    assert.equal(isSafeExternalUrl('http://example.com'), true)
})

test('does not care how the scheme is capitalised', () => {
    assert.equal(isSafeExternalUrl('HTTPS://example.com'), true)
    assert.equal(isSafeExternalUrl('HtTp://example.com'), true)
})

//! Refused
// Each of these would otherwise be handed to the operating system, which
// dispatches on the scheme without asking anything else.
test('refuses schemes that reach the local machine', () => {
    assert.equal(isSafeExternalUrl('file:///etc/passwd'), false)
    assert.equal(isSafeExternalUrl('javascript:alert(1)'), false)
    assert.equal(isSafeExternalUrl('data:text/html,<script>alert(1)</script>'), false)
    assert.equal(isSafeExternalUrl('vbscript:msgbox(1)'), false)
})

test('refuses a scheme registered by some other application', () => {
    assert.equal(isSafeExternalUrl('ms-msdt:/id PCWDiagnostic'), false)
    assert.equal(isSafeExternalUrl('smb://attacker/share'), false)
    assert.equal(isSafeExternalUrl('mailto:someone@example.com'), false)
})

test('refuses a string with no scheme of its own', () => {
    // scheme-relative, so a pattern match on the host would pass it
    assert.equal(isSafeExternalUrl('//example.com'), false)
    assert.equal(isSafeExternalUrl('/etc/passwd'), false)
    assert.equal(isSafeExternalUrl('example.com'), false)
    assert.equal(isSafeExternalUrl(''), false)
})

test('refuses a scheme that only opens like a web one', () => {
    assert.equal(isSafeExternalUrl('httpx://example.com'), false)
    assert.equal(isSafeExternalUrl(' javascript:alert(1)'), false)
})

test('refuses anything that is not a string', () => {
    assert.equal(isSafeExternalUrl(null), false)
    assert.equal(isSafeExternalUrl(undefined), false)
    assert.equal(isSafeExternalUrl(42), false)
    assert.equal(isSafeExternalUrl({ toString: () => 'https://example.com' }), false)
})
