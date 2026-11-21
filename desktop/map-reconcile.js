function updateMap(host, markup) {
  if (!host) return
  const template = host.ownerDocument.createElement('template')
  template.innerHTML = markup
  const next = template.content.firstElementChild
  if (!host.firstElementChild) { host.appendChild(next); return }
  const root = host.firstElementChild
  const offset = typeof root.getCurrentTime === 'function' ? root.getCurrentTime() : 0
  const prepare = node => {
    if (node.nodeType !== 1) return
    for (const animation of [node, ...node.querySelectorAll('[begin]')]) {
      const begin = animation.getAttribute('begin')
      if (begin && /^-?\d+(?:\.\d+)?s$/.test(begin)) animation.setAttribute('begin', `${parseFloat(begin) + offset}s`)
    }
  }
  const sync = (old, fresh) => {
    if (old.nodeType === 3) { if (old.nodeValue !== fresh.nodeValue) old.nodeValue = fresh.nodeValue; return }
    const animation = /^(animate|animateMotion|animateTransform)$/.test(old.localName)
    for (const attr of [...old.attributes]) if (!fresh.hasAttribute(attr.name)) old.removeAttribute(attr.name)
    for (const attr of [...fresh.attributes]) {
      // Generated begin values are relative to now; existing values are on
      // the SVG clock. Keep their phase unless a genuinely new event changed it.
      if (animation && attr.name === 'begin' && /^-?\d+(?:\.\d+)?s$/.test(attr.value)) {
        const desired = parseFloat(attr.value) + offset
        const previous = parseFloat(old.getAttribute('begin'))
        const repeating = fresh.getAttribute('repeatCount') === 'indefinite'
        const period = repeating ? parseFloat(fresh.getAttribute('dur')) : 0
        const difference = desired - previous
        const phaseDifference = period ? difference - Math.round(difference / period) * period : difference
        if (!Number.isFinite(previous) || Math.abs(phaseDifference) > 0.1) old.setAttribute('begin', `${desired}s`)
        continue
      }
      if (old.getAttribute(attr.name) !== attr.value) old.setAttribute(attr.name, attr.value)
    }
    const children = [...fresh.childNodes]
    const keys = new Set(children.map(n => n.nodeType === 1 && n.getAttribute('data-lm-key')).filter(Boolean))
    for (const child of [...old.childNodes]) {
      if (child.nodeType === 1 && child.hasAttribute('data-lm-overlay')) continue
      const key = child.nodeType === 1 && child.getAttribute('data-lm-key')
      if (key && !keys.has(key)) child.remove()
    }
    let cursor = old.firstChild
    for (const wanted of children) {
      while (cursor && cursor.nodeType === 1 && cursor.hasAttribute('data-lm-overlay')) cursor = cursor.nextSibling
      const key = wanted.nodeType === 1 && wanted.getAttribute('data-lm-key')
      let match = key ? [...old.childNodes].find(n => n.nodeType === 1 && n.getAttribute('data-lm-key') === key) : cursor
      if (match && (match.nodeType !== wanted.nodeType || match.nodeName !== wanted.nodeName || (!key && match.nodeType === 1 && match.hasAttribute('data-lm-key')))) match = null
      if (!match) { match = wanted.cloneNode(true); prepare(match); old.insertBefore(match, cursor) }
      else { if (match !== cursor) old.insertBefore(match, cursor); sync(match, wanted) }
      cursor = match.nextSibling
    }
    while (cursor) { const next = cursor.nextSibling; if (!(cursor.nodeType === 1 && cursor.hasAttribute('data-lm-overlay'))) cursor.remove(); cursor = next }
  }
  sync(root, next)
}

