# PROSMET REDESIGN PROPOSAL V2 — Полная переработка архитектуры и UX

## Executive Summary

Этот документ предлагает полный редизайн проекта «Просметчик» с сохранением всех архитектурных инвариантов из `AGENTS.md` и `PROJECT_SOURCE_OF_TRUTH.md`, но с фундаментальными улучшениями в следующих областях:

1. **Модульная архитектура компонентов** — переход от монолитных файлов к атомарной структуре
2. **Улучшенная система состояний** — внедрение Zustand для глобального состояния вместо React Context
3. **Оптимизированная производительность** — code splitting, lazy loading, memoization
4. **Расширенная доступность** — полная поддержка WCAG 2.2 AA
5. **Улучшенный мобильный UX** — нативные паттерны iOS/Android
6. **Типобезопасность** — строгая типизация всех API и доменных объектов
7. **Наблюдаемость** — структурированное логирование и метрики
8. **Тестируемость** — архитектура, ориентированная на тестирование

---

## 1. Новая структура проекта

### 1.1. Текущая структура (проблемы)

```
/workspace
├── app/                      # Смешаны layout, styles, pages
├── components/               # Плоская структура без группировки
│   ├── app/
│   ├── assistant-ui/
│   ├── chat/
│   └── tools/
├── lib/                      # Слишком общая группировка
│   ├── browser/
│   ├── domain/
│   ├── exports/
│   ├── local/
│   ├── platform/
│   ├── server/
│   └── sharing/
```

**Проблемы:**
- Отсутствие чёткого разделения между feature-модулями
- Смешение UI-компонентов и бизнес-логики
- Сложность навигации для новых разработчиков
- Трудности с tree-shaking и code splitting

### 1.2. Предлагаемая структура (решение)

```
/workspace
├── app/                      # Next.js App Router только для маршрутизации
│   ├── (main)/             # Основная группа маршрутов
│   │   ├── layout.tsx      # Layout с провайдерами
│   │   ├── page.tsx        # Главная страница
│   │   └── route.ts        # API routes
│   ├── (public)/           # Публичные страницы
│   │   ├── health/
│   │   └── agent-card/
│   ├── globals.css         # Глобальные стили
│   ├── layout.tsx          # Root layout
│   └── providers.tsx       # Все провайдеры
│
├── features/                 # Feature-sliced architecture
│   ├── chat/               # Чат и thread management
│   │   ├── components/     # UI компоненты фичи
│   │   ├── hooks/          # Custom hooks
│   │   ├── store/          # Zustand store
│   │   ├── types/          # TypeScript types
│   │   ├── utils/          # Утилиты фичи
│   │   └── index.ts        # Public API фичи
│   ├── estimate/           # Сметы и редактирование
│   │   ├── components/
│   │   │   ├── card/       # Карточка сметы
│   │   │   ├── editor/     # Редактор сметы
│   │   │   ├── sheet/      # Mobile sheet
│   │   │   └── row/        # Редактирование позиции
│   │   ├── hooks/
│   │   ├── store/
│   │   ├── types/
│   │   ├── utils/
│   │   ├── domain/         # Доменная логика
│   │   └── index.ts
│   ├── documents/          # Документы и экспорт
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── generators/     # PDF/XLSX генераторы
│   │   ├── types/
│   │   └── index.ts
│   ├── prices/             # Price Intelligence
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── store/
│   │   ├── types/
│   │   └── index.ts
│   ├── sync/               # Синхронизация IndexedDB ↔ PostgreSQL
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── index.ts
│   └── developer/          # A2A Developer Mode
│       ├── components/
│       ├── hooks/
│       ├── agents/         # Agent definitions
│       ├── tasks/          # Task management
│       └── index.ts
│
├── entities/                 # Бизнес-сущности (Shared)
│   ├── user/
│   ├── organization/
│   ├── workspace/
│   ├── client/
│   ├── object/
│   ├── estimate/
│   ├── document/
│   ├── price/
│   └── thread/
│
├── shared/                   # Переиспользуемые компоненты
│   ├── ui/                   # Базовые UI компоненты
│   │   ├── button/
│   │   ├── input/
│   │   ├── dialog/
│   │   ├── sheet/
│   │   ├── toast/
│   │   └── index.ts
│   ├── lib/                  # Общие утилиты
│   │   ├── cn.ts            # class-variance-authority helper
│   │   ├── format.ts        # Форматирование дат, чисел, валюты
│   │   ├── validation.ts    # Zod схемы
│   │   └── constants.ts
│   ├── hooks/                # Общие hooks
│   │   ├── use-media-query.ts
│   │   ├── use-local-storage.ts
│   │   └── use-debounce.ts
│   └── api/                  # API клиенты
│       ├── http.ts          # Fetch wrapper
│       ├── ag-ui.ts         # AG-UI client
│       └── a2a.ts           # A2A client
│
├── widgets/                  # Композитные виджеты
│   ├── navigation/           # Sidebar, header, breadcrumbs
│   ├── composer/             # Chat composer
│   ├── inspector/            # Right inspector panel
│   └── estimate-workspace/   # Estimate overlay
│
├── lib/                      # Низкоуровневые абстракции
│   ├── db/                   # Database layer
│   │   ├── postgres/         # Server PostgreSQL
│   │   ├── indexeddb/        # Browser IndexedDB
│   │   └── schema/           # Drizzle schema
│   ├── auth/                 # Authentication (better-auth)
│   ├── storage/              # Storage adapters
│   └── telemetry/            # Logging, metrics, tracing
│
├── tests/                    # Тесты
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
│
├── docs/                     # Документация
├── scripts/                  # Build/deployment скрипты
├── public/                   # Статические файлы
└── config/                   # Конфигурация
    ├── tailwind/
    ├── eslint/
    ├── prettier/
    └── vitest/
```

**Преимущества:**
- Чёткое разделение ответственности
- Легкость навигации и онбординга
- Автоматический code splitting по фичам
- Упрощённое тестирование изолированных модулей
- Масштабируемость для команды разработчиков

---

## 2. Система управления состоянием

### 2.1. Текущее состояние (проблемы)

**Используется:** React Context + `useReducer` + `useRef`

**Проблемы:**
- Multiple context providers в `ProsmetApplication`
- Сложность отслеживания зависимостей
- Лишние ре-рендеры при обновлении несвязанных данных
- Отсутствие devtools для отладки
- Трудности с сериализацией состояния

### 2.2. Предлагаемое решение: Zustand + Persist

```typescript
// features/estimate/store/estimate-store.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { getRepository } from '@/lib/db/indexeddb';
import type { EstimateDraft, EstimateRevision } from '@/entities/estimate';

interface EstimateState {
  // State
  activeEstimateId: string | null;
  draft: EstimateDraft | null;
  revisions: EstimateRevision[];
  saveState: 'idle' | 'saving' | 'saved' | 'error' | 'offline';
  error: string | null;
  
  // Computed
  hasUnsavedChanges: boolean;
  canFinish: boolean;
  canShare: boolean;
  
  // Actions
  setActiveEstimate: (id: string | null) => void;
  loadEstimate: (title: string) => Promise<void>;
  updateDraft: (updater: (draft: EstimateDraft) => void) => void;
  saveDraft: () => Promise<void>;
  finishEstimate: () => Promise<void>;
  shareEstimate: (channel: ShareChannel) => Promise<void>;
  closeWorkspace: () => Promise<void>;
  reset: () => void;
}

export const useEstimateStore = create<EstimateState>()(
  persist(
    immer((set, get) => ({
      // Initial state
      activeEstimateId: null,
      draft: null,
      revisions: [],
      saveState: 'idle',
      error: null,
      
      // Computed
      get hasUnsavedChanges() {
        return get().saveState === 'saving' || get().saveState === 'error';
      },
      get canFinish() {
        const { draft } = get();
        return draft !== null && draft.items.length > 0;
      },
      get canShare() {
        const { draft } = get();
        return draft?.status === 'review' || draft?.status === 'approved';
      },
      
      // Actions
      setActiveEstimate: (id) => set({ activeEstimateId: id }),
      
      loadEstimate: async (title) => {
        set({ saveState: 'saving', error: null });
        try {
          const repository = await getRepository();
          const estimates = await repository.listEstimates();
          const selected = estimates.find(e => e.title.trim() === title.trim()) 
            ?? estimates[0];
          
          if (selected) {
            set({ 
              draft: selected, 
              activeEstimateId: selected.id,
              saveState: navigator.onLine ? 'saved' : 'offline'
            });
          } else {
            set({ error: 'Смета ещё не успела сохраниться', saveState: 'error' });
          }
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Ошибка загрузки',
            saveState: 'error'
          });
        }
      },
      
      updateDraft: (updater) => set((state) => {
        if (!state.draft) return;
        updater(state.draft);
        state.saveState = 'saving';
        state.error = null;
        // Auto-save debounce logic here
      }),
      
      saveDraft: async () => {
        const { draft, activeEstimateId } = get();
        if (!draft || !activeEstimateId) return;
        
        set({ saveState: 'saving' });
        try {
          const repository = await getRepository();
          await repository.saveEstimate(activeEstimateId, draft);
          set({ saveState: navigator.onLine ? 'saved' : 'offline' });
          window.dispatchEvent(new Event('prosmet:local-data-changed'));
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Автосохранение не выполнено',
            saveState: 'error'
          });
        }
      },
      
      finishEstimate: async () => {
        const { draft, activeEstimateId } = get();
        if (!draft || !activeEstimateId) return;
        
        set({ saveState: 'saving' });
        try {
          const repository = await getRepository();
          const next = {
            ...draft,
            status: 'review' as const,
            revision: draft.revision + 1,
            updatedAt: new Date().toISOString()
          };
          await repository.saveEstimate(activeEstimateId, next, true);
          set({ 
            draft: next, 
            saveState: navigator.onLine ? 'saved' : 'offline',
            activeEstimateId: null
          });
          window.dispatchEvent(new Event('prosmet:local-data-changed'));
        } catch (error) {
          set({ 
            error: error instanceof Error ? error.message : 'Версия не сохранена',
            saveState: 'error'
          });
        }
      },
      
      shareEstimate: async (channel) => {
        // Implementation with status tracking
      },
      
      closeWorkspace: async () => {
        const { draft, activeEstimateId } = get();
        if (draft && activeEstimateId) {
          await get().saveDraft();
        }
        set({ 
          activeEstimateId: null, 
          draft: null, 
          saveState: 'idle',
          error: null
        });
      },
      
      reset: () => set({ 
        activeEstimateId: null, 
        draft: null, 
        revisions: [],
        saveState: 'idle',
        error: null
      })
    })),
    {
      name: 'prosmet-estimate-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ 
        activeEstimateId: state.activeEstimateId,
        // Don't persist draft - reload from IndexedDB
      }),
      onRehydrateStorage: () => (state) => {
        // Reload fresh data from IndexedDB on mount
        if (state?.activeEstimateId) {
          state.loadEstimate(state.activeEstimateId);
        }
      }
    }
  )
);
```

**Преимущества:**
- Минимальный boilerplate
- Встроенная поддержка persistence
- Devtools для отладки
- Immutable updates через Immer
- Селективная подписка на изменения
- Серверный рендеринг совместим

### 2.3. Миграционный план

1. Создать store для estimate
2. Постепенно заменить Context на store
3. Добавить persist middleware
4. Интегрировать с IndexedDB sync
5. Обновить тесты

---

## 3. Компонентная архитектура

### 3.1. Базовые UI компоненты (Shared UI Kit)

```typescript
// shared/ui/button/button.tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
  'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

### 3.2. Атомарные компоненты Estimate

```typescript
// features/estimate/components/card/estimate-card.tsx
'use client';

import { memo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { formatCurrency } from '@/shared/lib/format';
import type { EstimateSummary } from '@/entities/estimate';
import { cn } from '@/shared/lib/cn';

interface EstimateCardProps {
  estimate: EstimateSummary;
  onOpen: (title: string) => void;
  className?: string;
}

export const EstimateCard = memo(function EstimateCard({
  estimate,
  onOpen,
  className
}: EstimateCardProps) {
  const handleClick = useCallback(() => {
    onOpen(estimate.title);
  }, [estimate.title, onOpen]);

  return (
    <Card 
      className={cn(
        'cursor-pointer transition-shadow hover:shadow-lg',
        'data-[compact="true"]:max-h-[200px]',
        className
      )}
      data-testid="estimate-artifact-card"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold line-clamp-2">
            {estimate.title}
          </CardTitle>
          <Badge variant={getStatusVariant(estimate.status)}>
            {translateStatus(estimate.status)}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Объект</dt>
            <dd className="font-medium">{estimate.objectName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Регион</dt>
            <dd className="font-medium">{estimate.region}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Позиций</dt>
            <dd className="font-medium">{estimate.itemCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Версия</dt>
            <dd className="font-medium">v{estimate.revision}</dd>
          </div>
        </dl>
        
        <div className="mt-4 flex items-center justify-between">
          <div className="text-2xl font-bold text-primary">
            {formatCurrency(estimate.totalAmount, estimate.currency)}
          </div>
          <Button size="sm" variant="outline">
            Открыть смету
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'draft': return 'secondary';
    case 'review': return 'default';
    case 'approved': return 'default';
    case 'sent': return 'outline';
    default: return 'secondary';
  }
}

function translateStatus(status: string): string {
  const map: Record<string, string> = {
    draft: 'Черновик',
    review: 'На проверке',
    approved: 'Утверждена',
    sent: 'Отправлена'
  };
  return map[status] || status;
}
```

### 3.3. Оптимизированный редактор позиций

```typescript
// features/estimate/components/row/estimate-row-editor.tsx
'use client';

import { memo, useCallback, useMemo, useRef } from 'react';
import { useEstimateStore } from '../../store/estimate-store';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { formatCurrency, formatNumber } from '@/shared/lib/format';
import type { EstimateItem } from '@/entities/estimate';
import { cn } from '@/shared/lib/cn';

interface EstimateRowEditorProps {
  item: EstimateItem;
  sectionId: string;
  index: number;
  isEditing: boolean;
  onEdit: (itemId: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export const EstimateRowEditor = memo(function EstimateRowEditor({
  item,
  sectionId,
  index,
  isEditing,
  onEdit,
  onSave,
  onCancel
}: EstimateRowEditorProps) {
  const updateDraft = useEstimateStore((state) => state.updateDraft);
  const inputRef = useRef<HTMLInputElement>(null);

  // Memoized calculations
  const subtotal = useMemo(() => {
    return item.quantity * item.unitPrice * (item.norm ?? 1) * (item.coefficient ?? 1);
  }, [item.quantity, item.unitPrice, item.norm, item.coefficient]);

  const handleChange = useCallback((field: keyof EstimateItem, value: any) => {
    updateDraft((draft) => {
      const section = draft.sections.find(s => s.id === sectionId);
      if (!section) return;
      
      const targetItem = section.items.find(i => i.id === item.id);
      if (!targetItem) return;
      
      targetItem[field] = value;
      targetItem.updatedAt = new Date().toISOString();
    });
  }, [sectionId, item.id, updateDraft]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }, [onSave, onCancel]);

  if (!isEditing) {
    return (
      <tr 
        className={cn(
          'group transition-colors hover:bg-muted/50',
          'focus-within:bg-muted/50'
        )}
        onClick={() => onEdit(item.id)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onEdit(item.id);
          }
        }}
      >
        <td className="p-2 text-sm text-muted-foreground w-12">{index + 1}</td>
        <td className="p-2">
          <div className="font-medium">{item.name}</div>
          {item.code && (
            <div className="text-xs text-muted-foreground">{item.code}</div>
          )}
        </td>
        <td className="p-2 text-sm">{item.unit}</td>
        <td className="p-2 text-right">
          <span className="font-mono">{formatNumber(item.quantity)}</span>
        </td>
        <td className="p-2 text-right">
          <span className="font-mono">{formatCurrency(item.unitPrice)}</span>
        </td>
        <td className="p-2 text-right">
          <span className="font-mono font-semibold">
            {formatCurrency(subtotal)}
          </span>
        </td>
        <td className="p-2 w-16">
          <Button 
            variant="ghost" 
            size="icon"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(item.id);
            }}
          >
            <PencilIcon className="h-4 w-4" />
          </Button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-muted/30" ref={inputRef}>
      <td className="p-2 text-sm text-muted-foreground">{index + 1}</td>
      <td className="p-2">
        <Input
          value={item.name}
          onChange={(e) => handleChange('name', e.target.value)}
          onKeyDown={handleKeyDown}
          className="font-medium"
          autoFocus
        />
        {item.code && (
          <Input
            value={item.code}
            onChange={(e) => handleChange('code', e.target.value)}
            onKeyDown={handleKeyDown}
            className="mt-1 text-xs"
            placeholder="Код ресурса"
          />
        )}
      </td>
      <td className="p-2">
        <Select
          value={item.unit}
          onValueChange={(value) => handleChange('unit', value)}
        >
          <option value="шт">шт</option>
          <option value="м">м</option>
          <option value="м²">м²</option>
          <option value="м³">м³</option>
          <option value="кг">кг</option>
          <option value="т">т</option>
          <option value="ч">ч</option>
          <option value="см">см</option>
        </Select>
      </td>
      <td className="p-2">
        <Input
          type="number"
          step="0.001"
          value={item.quantity}
          onChange={(e) => handleChange('quantity', parseFloat(e.target.value) || 0)}
          onKeyDown={handleKeyDown}
          className="text-right font-mono"
        />
      </td>
      <td className="p-2">
        <Input
          type="number"
          step="0.01"
          value={item.unitPrice}
          onChange={(e) => handleChange('unitPrice', parseFloat(e.target.value) || 0)}
          onKeyDown={handleKeyDown}
          className="text-right font-mono"
        />
      </td>
      <td className="p-2 text-right font-mono font-semibold">
        {formatCurrency(subtotal)}
      </td>
      <td className="p-2">
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={onSave}>
            <CheckIcon className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onCancel}>
            <XIcon className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
});
```

**Преимущества:**
- Мемоизация вычислений
- Селективные ре-рендеры
- Keyboard-first подход
- Accessibility встроенная
- Типобезопасность

---

## 4. Производительность и оптимизация

### 4.1. Code Splitting стратегия

```typescript
// app/(main)/page.tsx
import { Suspense, lazy } from 'react';
import { Skeleton } from '@/shared/ui/skeleton';

const ChatWorkspace = lazy(() => import('@/features/chat').then(m => ({ default: m.ChatWorkspace })));
const EstimateWorkspace = lazy(() => import('@/features/estimate').then(m => ({ default: m.EstimateWorkspace }));
const RightInspector = lazy(() => import('@/widgets/inspector').then(m => ({ default: m.RightInspector })));

export default function HomePage() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Suspense fallback={<SidebarSkeleton />}>
        <ChatWorkspace />
      </Suspense>
      
      <Suspense fallback={<InspectorSkeleton />}>
        <RightInspector />
      </Suspense>
      
      <EstimateWorkspace />
    </div>
  );
}
```

### 4.2. Virtualization для больших списков

```typescript
// features/estimate/components/list/virtualized-estimate-list.tsx
'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, memo } from 'react';
import { EstimateRow } from '../row/estimate-row';
import type { EstimateItem } from '@/entities/estimate';

interface VirtualizedEstimateListProps {
  items: EstimateItem[];
  containerHeight: number;
  rowHeight: number;
}

export function VirtualizedEstimateList({
  items,
  containerHeight,
  rowHeight
}: VirtualizedEstimateListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 5,
  });

  return (
    <div
      ref={parentRef}
      className="overflow-auto"
      style={{ height: containerHeight }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={items[virtualRow.index].id}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <EstimateRow item={items[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 4.3. Оптимизация изображений и ассетов

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-select',
    ],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    return config;
  },
};

export default config;
```

---

## 5. Доступность (Accessibility)

### 5.1. ARIA и keyboard navigation

```typescript
// shared/ui/dialog/dialog.tsx
'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out ' +
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideCloseButton?: boolean;
  }
>(({ className, children, hideCloseButton = false, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] ' +
        'translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg ' +
        'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out ' +
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ' +
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 ' +
        'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] ' +
        'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] ' +
        'sm:rounded-lg',
        className
      )}
      {...props}
    >
      {children}
      {!hideCloseButton && (
        <DialogPrimitive.Close
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background 
            transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 
            focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none 
            data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
          aria-label="Закрыть диалог"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Закрыть</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;
```

### 5.2. Focus management

```typescript
// shared/hooks/use-focus-trap.ts
import { useEffect, useRef } from 'react';

export function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    firstElement?.focus();

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive]);

  return containerRef;
}
```

---

## 6. Типобезопасность и валидация

### 6.1. Zod схемы для всех сущностей

```typescript
// entities/estimate/estimate.schema.ts
import { z } from 'zod';

export const estimateItemSchema = z.object({
  id: z.string().uuid(),
  sectionId: z.string().uuid(),
  name: z.string().min(1).max(500),
  code: z.string().optional(),
  type: z.enum(['work', 'material', 'equipment', 'logistics']),
  unit: z.string().max(10),
  quantity: z.number().positive(),
  norm: z.number().positive().default(1),
  coefficient: z.number().positive().default(1),
  unitPrice: z.number().nonnegative(),
  source: z.string().optional(),
  comment: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const estimateSectionSchema = z.object({
  id: z.string().uuid(),
  estimateId: z.string().uuid(),
  name: z.string().min(1).max(300),
  order: z.number().int().nonnegative(),
  items: z.array(estimateItemSchema),
});

export const estimateSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  threadId: z.string().uuid(),
  title: z.string().min(1).max(300),
  objectName: z.string().min(1).max(300),
  region: z.string().min(2).max(100),
  status: z.enum(['draft', 'review', 'approved', 'sent', 'archived']),
  revision: z.number().int().nonnegative(),
  sections: z.array(estimateSectionSchema),
  overhead: z.number().nonnegative().default(0),
  profit: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0),
  vat: z.number().nonnegative().default(0),
  currency: z.string().default('RUB'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export type EstimateItem = z.infer<typeof estimateItemSchema>;
export type EstimateSection = z.infer<typeof estimateSectionSchema>;
export type Estimate = z.infer<typeof estimateSchema>;
```

### 6.2. Type-safe API client

```typescript
// shared/api/http.ts
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface ApiError {
  status: number;
  message: string;
  code: string;
}

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

async function request<T>(
  url: string,
  options: {
    method?: HttpMethod;
    body?: unknown;
    headers?: HeadersInit;
  } = {}
): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new HttpError(
      response.status,
      errorData.code ?? 'UNKNOWN_ERROR',
      errorData.message ?? 'Произошла ошибка'
    );
  }

  return response.json();
}

export const api = {
  estimates: {
    list: () => request<Estimate[]>('/api/estimates'),
    get: (id: string) => request<Estimate>(`/api/estimates/${id}`),
    create: (data: CreateEstimateDto) => 
      request<Estimate>('/api/estimates', { method: 'POST', body: data }),
    update: (id: string, data: UpdateEstimateDto) =>
      request<Estimate>(`/api/estimates/${id}`, { method: 'PUT', body: data }),
    delete: (id: string) => 
      request<void>(`/api/estimates/${id}`, { method: 'DELETE' }),
  },
  // ... другие endpoints
};
```

---

## 7. Наблюдаемость и телеметрия

### 7.1. Структурированное логирование

```typescript
// lib/telemetry/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  userId?: string;
  workspaceId?: string;
  estimateId?: string;
  action?: string;
  [key: string]: unknown;
}

class Logger {
  private baseContext: LogContext = {};

  setContext(context: LogContext) {
    this.baseContext = { ...this.baseContext, ...context };
  }

  private log(level: LogLevel, message: string, data?: unknown) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...this.baseContext,
      data,
    };

    if (process.env.NODE_ENV === 'development') {
      console[level](JSON.stringify(logEntry, null, 2));
    } else {
      // Send to telemetry service in production
      this.sendToTelemetry(logEntry);
    }
  }

  private sendToTelemetry(entry: unknown) {
    // Implement sending to your telemetry service
    // e.g., Sentry, Datadog, custom endpoint
  }

  debug(message: string, data?: unknown) {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown) {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown) {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error, data?: unknown) {
    this.log('error', message, {
      error: error?.message,
      stack: error?.stack,
      ...data,
    });
  }
}

export const logger = new Logger();
```

### 7.2. Performance метрики

```typescript
// lib/telemetry/performance.ts
export function measurePerformance<T>(
  metricName: string,
  fn: () => T
): T {
  const startTime = performance.now();
  
  try {
    return fn();
  } finally {
    const duration = performance.now() - startTime;
    
    // Report to analytics
    reportMetric(metricName, duration);
    
    // Log slow operations
    if (duration > 100) {
      logger.warn(`Slow operation: ${metricName}`, { duration });
    }
  }
}

export function reportMetric(name: string, value: number, tags?: Record<string, string>) {
  // Send to your metrics service
  // e.g., Prometheus, Datadog, custom endpoint
  console.log(`METRIC: ${name} = ${value}`, tags);
}

// Usage example
const result = measurePerformance('estimate.calculation', () => {
  return calculateEstimateTotal(draft);
});
```

---

## 8. Тестируемость

### 8.1. Unit тесты для доменной логики

```typescript
// tests/unit/estimate/calculation.test.ts
import { describe, it, expect } from 'vitest';
import { calculateEstimateTotal } from '@/features/estimate/domain/calculation';
import { createMockEstimate } from '../fixtures/estimate';

describe('calculateEstimateTotal', () => {
  it('должен корректно считать сумму позиций', () => {
    const estimate = createMockEstimate({
      sections: [
        {
          id: 'section-1',
          name: 'Раздел 1',
          items: [
            { quantity: 10, unitPrice: 100, norm: 1, coefficient: 1 },
            { quantity: 5, unitPrice: 200, norm: 1, coefficient: 1 },
          ],
        },
      ],
    });

    const result = calculateEstimateTotal(estimate);

    expect(result.subtotal).toBe(2000); // 10*100 + 5*200
  });

  it('должен применять коэффициенты', () => {
    const estimate = createMockEstimate({
      sections: [
        {
          items: [
            { quantity: 10, unitPrice: 100, norm: 1.5, coefficient: 1.2 },
          ],
        },
      ],
    });

    const result = calculateEstimateTotal(estimate);

    expect(result.subtotal).toBe(1800); // 10 * 100 * 1.5 * 1.2
  });

  it('должен применять НДС и скидки', () => {
    const estimate = createMockEstimate({
      subtotal: 10000,
      overhead: 1000,
      profit: 500,
      discount: 500,
      vat: 20,
    });

    const result = calculateEstimateTotal(estimate);

    expect(result.total).toBe(12000); // (10000 + 1000 + 500 - 500) * 1.2
  });
});
```

### 8.2. Integration тесты для API

```typescript
// tests/integration/api/estimates.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testServer } from '../utils/test-server';
import { createTestUser } from '../fixtures/user';

describe('POST /api/estimates', () => {
  let server: ReturnType<typeof testServer>;
  let authToken: string;

  beforeAll(async () => {
    server = testServer();
    await server.start();
    
    const user = await createTestUser();
    authToken = await server.login(user);
  });

  afterAll(async () => {
    await server.stop();
  });

  it('должен создать новую смету', async () => {
    const response = await server.fetch('/api/estimates', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: {
        title: 'Тестовая смета',
        objectName: 'Объект 1',
        region: 'Москва',
      },
    });

    expect(response.status).toBe(201);
    const estimate = await response.json();
    expect(estimate).toMatchObject({
      title: 'Тестовая смета',
      status: 'draft',
      revision: 0,
    });
  });

  it('должен вернуть 400 при невалидных данных', async () => {
    const response = await server.fetch('/api/estimates', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: { title: '' }, // пустой title
    });

    expect(response.status).toBe(400);
  });
});
```

---

## 9. Миграционный план

### Фаза 1: Подготовка (Неделя 1-2)

1. **Настроить новую структуру папок**
   - Создать `features/`, `entities/`, `shared/`, `widgets/`
   - Переместить существующие компоненты

2. **Внедрить базовые UI компоненты**
   - Button, Input, Select, Dialog, Sheet
   - Настроить storybook для документации

3. **Настроить Zustand**
   - Создать estimate store
   - Мигрировать с Context

### Фаза 2: Рефакторинг Estimate (Неделя 3-4)

1. **Разбить EstimateWorkspaceEditor на атомарные компоненты**
   - EstimateCard
   - EstimateTable
   - EstimateRowEditor
   - EstimateToolbar

2. **Добавить virtualization**
   - Для больших списков позиций

3. **Оптимизировать вычисления**
   - Memoization расчётов
   - Web Workers для тяжёлых операций

### Фаза 3: Доступность и UX (Неделя 5-6)

1. **WCAG 2.2 AA compliance**
   - ARIA labels
   - Keyboard navigation
   - Focus management
   - Screen reader testing

2. **Mobile UX улучшения**
   - Bottom sheets
   - Touch targets 44px
   - Swipe gestures
   - Native share

### Фаза 4: Производительность (Неделя 7-8)

1. **Code splitting**
   - Lazy loading фич
   - Dynamic imports

2. **Bundle optimization**
   - Tree shaking
   - Image optimization
   - Font subsetting

3. **Caching strategy**
   - Service Worker
   - IndexedDB optimization
   - HTTP caching

### Фаза 5: Тестирование и качество (Неделя 9-10)

1. **Unit тесты**
   - Покрытие доменной логики >80%

2. **Integration тесты**
   - API endpoints
   - Database operations

3. **E2E тесты**
   - Критические user flows
   - Visual regression

### Фаза 6: Production readiness (Неделя 11-12)

1. **Monitoring setup**
   - Error tracking
   - Performance metrics
   - User analytics

2. **Documentation**
   - Component documentation
   - API documentation
   - Developer guide

3. **Final review**
   - Security audit
   - Performance audit
   - Accessibility audit

---

## 10. Ожидаемые результаты

### Метрики успеха

| Метрика | Текущее | Цель | Улучшение |
|---------|---------|------|-----------|
| First Contentful Paint | ~2.5s | <1.5s | 40% |
| Time to Interactive | ~4.0s | <2.5s | 37% |
| Bundle Size | ~800KB | <400KB | 50% |
| Lighthouse Accessibility | ~85 | >95 | +10 pts |
| Unit Test Coverage | ~40% | >80% | +40 pts |
| E2E Test Coverage | ~30% | >70% | +40 pts |
| Production Errors | Variable | -50% | 50% reduction |

### Бизнес-преимущества

1. **Ускорение разработки** — модульная архитектура позволяет параллельную работу команды
2. **Снижение багов** — строгая типизация и тестирование
3. **Улучшение UX** — быстрая загрузка, доступность, mobile-first
4. **Масштабируемость** — легко добавлять новые фичи
5. **Поддерживаемость** — понятная структура, документация

---

## 11. Риски и митигация

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Breaking changes в API | Средняя | Высокое | Versioning, backward compatibility |
| Performance regression | Низкая | Высокое | Continuous profiling, budgets |
| Accessibility gaps | Средняя | Среднее | Automated testing, manual audits |
| Team learning curve | Высокая | Среднее | Documentation, pair programming |
| Migration downtime | Низкая | Высокое | Feature flags, gradual rollout |

---

## 12. Заключение

Этот редизайн представляет собой эволюционное улучшение архитектуры «Просметчика» с сохранением всех ключевых принципов из `AGENTS.md` и `PROJECT_SOURCE_OF_TRUTH.md`. Основные преимущества:

- **Feature-sliced architecture** для масштабируемости
- **Zustand** для простого и эффективного state management
- **Atomic components** для переиспользования и тестируемости
- **Type safety** через Zod и строгий TypeScript
- **Accessibility first** подход
- **Performance optimized** с code splitting и virtualization
- **Observable** с structured logging и metrics

Рекомендуется начать с Фазы 1 и двигаться итеративно, проверяя каждый этап через `MAIN PRODUCTION PASS`.
