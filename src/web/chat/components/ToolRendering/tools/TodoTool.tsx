import React from 'react';
import { Circle, Clock, CheckCircle } from 'lucide-react';
import { parseTodos } from '../../../utils/tool-utils';

interface TodoToolProps {
  input: any;
  result: string;
  isWrite: boolean;
}

function getTodoStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle size={16} className="text-green-500 flex-shrink-0" />;
    case 'in_progress':
      return <Clock size={16} className="text-blue-500 flex-shrink-0" />;
    case 'pending':
    default:
      return <Circle size={16} className="text-muted-foreground flex-shrink-0" />;
  }
}

export function TodoTool({ input, result, isWrite }: TodoToolProps) {
  let todos: Array<{id: string; content: string; status: string}> = [];
  
  if (isWrite && input.todos && Array.isArray(input.todos)) {
    // For TodoWrite, use the input todos (the new state)
    todos = input.todos;
  } else if (!isWrite && result) {
    // For TodoRead, parse the result JSON
    todos = parseTodos(result);
  }

  if (todos.length === 0) {
    return (
      <div className="flex flex-col gap-1 -mt-0.5">
        <div className="text-sm text-muted-foreground">
          No todos found
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 -mt-0.5">
      <div className="bg-muted/50 rounded-xl p-4 mt-1">
        <div className="flex flex-col gap-3">
          {todos.map((todo) => (
            <div key={todo.id} className="flex items-start gap-2 text-sm leading-6">
              <div className="mt-0.5 flex items-center">
                {getTodoStatusIcon(todo.status)}
              </div>
              <span className={`text-foreground ${
                todo.status === 'completed' ? 'line-through text-muted-foreground' : ''
                }`}>
                {todo.content}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}