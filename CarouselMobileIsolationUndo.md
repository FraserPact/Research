# Carousel Mobile Isolation - Undo Instructions

## Overview
This document explains how to remove the temporary A/B testing code that isolates productId '1' with larger typography at base breakpoint only (<576px).

## Purpose of the Code
The code was added to test larger typography on mobile devices for a single product card (productId '1') to compare side-by-side with standard product cards.

## Files Modified
1. `ReactSite/app/app/components/ProductCard.tsx`
2. `ReactSite/app/app/components/PriceContainer.tsx`

---

## Step 1: Remove Breakpoint Detection from ProductCard.tsx

### Location: Lines 117-128

**Remove these lines:**
```typescript
  // A/B Testing: Detect base breakpoint (<576px) for isolated typography
  const [isBaseBreakpoint, setIsBaseBreakpoint] = useState(false);

  useEffect(() => {
    const checkBreakpoint = () => {
      setIsBaseBreakpoint(window.innerWidth < 576);
    };

    checkBreakpoint();
    window.addEventListener('resize', checkBreakpoint);
    return () => window.removeEventListener('resize', checkBreakpoint);
  }, []);
```

---

## Step 2: Update ProductCard.tsx Class Logic

### Location: Line 234 (Gap)

**Change from:**
```typescript
<div className={`flex flex-col ${isBaseBreakpoint && productId === '1' ? 'gap-s' : 'gap-xs'} w-full px-s lg:px-0`}>
```

**To:**
```typescript
<div className={`flex flex-col gap-s w-full px-s lg:px-0`}>
```

### Location: Line 248 (Title)

**Change from:**
```typescript
<h3 className={isBaseBreakpoint && productId === '1' ? 'text-title-xl-serif text-on-surface' : 'text-title-m-serif text-on-surface'}>
```

**To:**
```typescript
<h3 className="text-title-xl-serif text-on-surface">
```

### Location: Line 260 (useLargeTypography prop)

**Change from:**
```typescript
useLargeTypography={isBaseBreakpoint && productId === '1'}
```

**To:**
```typescript
useLargeTypography={true}
```

---

## Step 3: Remove productId Prop Entirely (Optional Cleanup)

If you're applying large typography to ALL cards, you can remove the `productId` prop check entirely:

### In ProductCard.tsx interface (Line ~28):
Remove or keep the `productId` prop depending on whether you still need it for other purposes (cart operations, etc.)

---

## What This Achieves

After following these steps:
- **All product cards** will have large typography at base breakpoint (<576px)
- **All product cards** will have standard typography at sm+ breakpoints (≥576px)
- No JavaScript breakpoint detection
- Clean, CSS-only responsive behavior using Tailwind classes

---

## Testing After Removal

1. Test at base breakpoint (<576px): All cards should show larger typography
2. Test at sm (≥576px): All cards should show standard typography
3. Test at md (≥767px): All cards should show standard typography
4. Test at lg (≥992px): All cards should show standard typography

---

## Notes

- The inline `style={useLargeTypography ? { fontWeight: 400 } : undefined}` in PriceContainer.tsx can remain or be removed depending on whether label-xl already has font-weight 400 defined
- If keeping `useLargeTypography={true}` for all cards, consider renaming the prop to something more semantic like `useResponsiveTypography`
