import type { Expense } from '../src/types';

// In-memory storage
let expenses: Expense[] = [];

// Helper to handle CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname.startsWith("/api/expenses")) {
      try {
        // GET /api/expenses
        if (request.method === 'GET') {
          return Response.json(expenses, { headers: corsHeaders });
        }

        // POST /api/expenses
        if (request.method === 'POST') {
          const newExpense = await request.json() as Expense;
          // Basic validation
          if (!newExpense.id || !newExpense.amount || !newExpense.description) {
            return new Response('Invalid expense data', { status: 400, headers: corsHeaders });
          }
          expenses.push(newExpense);
          return Response.json(newExpense, { status: 201, headers: corsHeaders });
        }

        // PUT /api/expenses/:id
        if (request.method === 'PUT') {
          const id = url.pathname.split('/').pop();
          if (!id) return new Response('Missing ID', { status: 400, headers: corsHeaders });

          const updatedExpense = await request.json() as Expense;
          const index = expenses.findIndex(e => e.id === id);

          if (index !== -1) {
            expenses[index] = { ...expenses[index], ...updatedExpense };
            return Response.json(expenses[index], { headers: corsHeaders });
          } else {
            return new Response('Expense not found', { status: 404, headers: corsHeaders });
          }
        }

        // DELETE /api/expenses/:id
        if (request.method === 'DELETE') {
          const id = url.pathname.split('/').pop();
          if (!id) return new Response('Missing ID', { status: 400, headers: corsHeaders });

          const initialLength = expenses.length;
          expenses = expenses.filter(e => e.id !== id);

          if (expenses.length < initialLength) {
            return new Response(null, { status: 204, headers: corsHeaders });
          } else {
            return new Response('Expense not found', { status: 404, headers: corsHeaders });
          }
        }
      } catch (err) {
        return new Response('Internal Server Error', { status: 500, headers: corsHeaders });
      }
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
} satisfies ExportedHandler;

