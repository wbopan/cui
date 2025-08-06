# Converting CSS Modules to shadcn/ui + Tailwind CSS

This guide walks through the process of migrating components from CSS Modules to shadcn/ui components with Tailwind CSS, maintaining design consistency while reducing unnecessary styles.

## Overview

The migration from CSS Modules to shadcn/ui + Tailwind involves:
1. Replacing custom implementations with shadcn/ui components
2. Converting CSS classes to Tailwind utility classes
3. Maintaining visual consistency while removing redundant styles

## Step-by-Step Migration Process

### 1. Analyze the Existing Component

Before migrating, understand what the component does:
- Identify reusable UI patterns (buttons, inputs, dropdowns)
- Note custom styling requirements
- Document any animations or transitions

```tsx
// Example: Original component with CSS Modules
import styles from './Component.module.css';

<button className={styles.actionButton}>
  Click me
</button>
```

The css modules need to be removed after the migrating

### 2. Install shadcn/ui Components

Install relevant shadcn/ui components that match your needs:

```bash
# Install individual components
npx shadcn@latest add button
npx shadcn@latest add textarea
npx shadcn@latest add tooltip

# Or install dependencies manually only if needed
bun add @radix-ui/react-slot @radix-ui/react-tooltip
```

### 3. Replace Custom Elements with shadcn/ui Components

Map your custom implementations to shadcn/ui equivalents:

| Custom Element | shadcn/ui Component | Benefits |
|---------------|-------------------|----------|
| `<button>` | `<Button>` | Variants, sizes, accessibility |
| `<textarea>` | `<Textarea>` | Consistent styling, focus states |
| Icon buttons | `<Button>` + `<Tooltip>` | Better UX with tooltips |

DO add complete aria-label for all the components according to their role.

### 4. Convert CSS to Tailwind Utilities

Transform CSS Module styles to Tailwind classes:

```css
/* Before: CSS Module */
.container {
  display: flex;
  align-items: center;
  padding: 16px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  transition: all 0.3s ease;
}

.container:hover {
  background: var(--color-bg-tertiary);
}
```

```tsx
// After: Tailwind Classes
<div className="flex items-center p-4 bg-background border border-border rounded-xl transition-all hover:bg-muted/50">
```

IMPORTANT: include the relevant styles define in src/web/chat/styles/global.css and theme.css in the component style. We are going to remove these files are migration. You should also use tailwind class to define color and sizes like neutral-500, etc.


### 5. Maintain Design Consistency

Keep your minimalistic design aesthetic:

- **Use muted colors**: `text-muted-foreground`, `bg-muted/50`
- **Consistent spacing**: Use Tailwind's spacing scale

### 7. Remove Redundant Styles

Eliminate unnecessary CSS by leveraging Tailwind's utilities:

```tsx
// Instead of custom CSS for common patterns
// Use Tailwind's built-in utilities

// Centering
"flex items-center justify-center"

// Truncation
"overflow-hidden text-ellipsis whitespace-nowrap"

// Focus states
"focus-visible:outline-none focus-visible:ring-2"

// Disabled states
"disabled:cursor-not-allowed disabled:opacity-50"
```

### 8. Common Layout Issues and Solutions

When migrating complex layouts, watch out for these common pitfalls:

- **Icon-label alignment**: Use `flex items-center` and `flex-shrink-0` on icons to prevent misalignment
- **Sidebar height control**: Separate background containers from content containers - use wrapper div with `h-full` for background, inner element with `h-auto` for content sizing
- **Tab navigation sizing**: Avoid letting TabsList stretch full height; wrap it in a container div and let the list size naturally with `h-auto`
- **Vertical tabs layout**: Structure as `<Tabs><div><TabsList>` instead of trying to override TabsList default horizontal behavior
- **Component spacing**: Use `py-2.5` instead of `py-3` for more compact navigation items
- **Flex container nesting**: Ensure proper flex parent-child relationships to prevent content appearing under sidebars
- **Background extension**: Use separate divs for backgrounds vs interactive elements to control visual coverage independently

## Checklist

- [ ] Identify shadcn/ui components to use
- [ ] Install required dependencies
- [ ] Replace custom elements with shadcn/ui components
- [ ] Add complete aria-label for all the components according to their role.
- [ ] Convert CSS to Tailwind utilities
- [ ] Handle CSS specificity conflicts
- [ ] Add tooltips for better UX
- [ ] Test all interactive states (hover, focus, disabled)
- [ ] Remove unused CSS modules
- [ ] Update imports and clean up
