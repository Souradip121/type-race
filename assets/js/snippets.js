// The race texts. Every snippet is short (4 to 8 lines), correct code.
// Players never type leading indentation: the app fills it in for them.
// The server keeps a copy of these in tr_snippets (see scripts/snippets-sql.mjs),
// because it times races and needs each snippet's typed length.
//
// Linked-list snippets assume the usual node type:
//   C:      typedef struct Node { int data; struct Node *next; } Node;
//   Java:   class Node { int val; Node next; Node(int v) { val = v; } }
//   Python: class Node: def __init__(self, val): self.val, self.next = val, None

export const LANGS = [
  { id: 'c', label: 'C' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
];

export const SNIPPETS = [
  // ---------------------------------------------------------------- C
  { id: 'c-binary-search', lang: 'c', title: 'Binary search', code:
`int bs(int a[], int l, int r, int x) {
    if (l > r) return -1;
    int m = (l + r) / 2;
    if (a[m] == x) return m;
    if (a[m] < x) l = m + 1;
    else r = m - 1;
    return bs(a, l, r, x);
}` },
  { id: 'c-bubble-sort', lang: 'c', title: 'Bubble sort', code:
`void bubble_sort(int a[], int n) {
    for (int i = 0; i < n - 1; i++)
        for (int j = 0; j < n - 1 - i; j++)
            if (a[j] > a[j + 1])
                swap(&a[j], &a[j + 1]);
}` },
  { id: 'c-swap', lang: 'c', title: 'Swap with pointers', code:
`void swap(int *a, int *b) {
    int t = *a;
    *a = *b;
    *b = t;
}` },
  { id: 'c-list-push', lang: 'c', title: 'Linked list: insert at head', code:
`Node *push(Node *head, int v) {
    Node *n = malloc(sizeof(Node));
    n->data = v;
    n->next = head;
    return n;
}` },
  { id: 'c-list-append', lang: 'c', title: 'Linked list: insert at end', code:
`Node *append(Node *head, Node *n) {
    if (head == NULL) return n;
    Node *cur = head;
    while (cur->next) cur = cur->next;
    cur->next = n;
    return head;
}` },
  { id: 'c-list-reverse', lang: 'c', title: 'Reverse a linked list', code:
`Node *reverse(Node *h) {
    Node *prev = NULL, *next;
    while (h) {
        next = h->next; h->next = prev;
        prev = h; h = next;
    }
    return prev;
}` },
  { id: 'c-factorial', lang: 'c', title: 'Factorial', code:
`long factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}` },
  { id: 'c-gcd', lang: 'c', title: 'GCD (Euclid)', code:
`int gcd(int a, int b) {
    while (b != 0) {
        int t = a % b;
        a = b;
        b = t;
    }
    return a;
}` },
  { id: 'c-is-prime', lang: 'c', title: 'Prime check', code:
`int is_prime(int n) {
    if (n < 2) return 0;
    for (int i = 2; i * i <= n; i++)
        if (n % i == 0) return 0;
    return 1;
}` },
  { id: 'c-strlen', lang: 'c', title: 'String length', code:
`int str_len(const char *s) {
    int n = 0;
    while (s[n] != '\\0') n++;
    return n;
}` },
  { id: 'c-reverse-string', lang: 'c', title: 'Reverse a string', code:
`void reverse_str(char *s) {
    int i = 0, j = strlen(s) - 1;
    while (i < j) {
        char t = s[i];
        s[i++] = s[j];
        s[j--] = t;
    }
}` },
  { id: 'c-fibonacci', lang: 'c', title: 'Fibonacci', code:
`int fib(int n) {
    int a = 0, b = 1, t;
    while (n-- > 0) {
        t = a + b; a = b; b = t;
    }
    return a;
}` },
  { id: 'c-max', lang: 'c', title: 'Largest element', code:
`int max_of(int a[], int n) {
    int m = a[0];
    for (int i = 1; i < n; i++)
        if (a[i] > m) m = a[i];
    return m;
}` },
  { id: 'c-digit-sum', lang: 'c', title: 'Sum of digits', code:
`int digit_sum(int n) {
    int s = 0;
    while (n > 0) {
        s += n % 10;
        n /= 10;
    }
    return s;
}` },

  // ----------------------------------------------------------- Python
  { id: 'py-binary-search', lang: 'python', title: 'Binary search', code:
`def binary_search(a, x):
    lo, hi = 0, len(a) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if a[mid] == x: return mid
        if a[mid] < x: lo = mid + 1
        else: hi = mid - 1
    return -1` },
  { id: 'py-bubble-sort', lang: 'python', title: 'Bubble sort', code:
`def bubble_sort(a):
    n = len(a)
    for i in range(n):
        for j in range(n - i - 1):
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]
    return a` },
  { id: 'py-list-append', lang: 'python', title: 'Linked list: insert at end', code:
`def append(head, val):
    if head is None:
        return Node(val)
    cur = head
    while cur.next:
        cur = cur.next
    cur.next = Node(val)
    return head` },
  { id: 'py-list-reverse', lang: 'python', title: 'Reverse a linked list', code:
`def reverse(head):
    prev = None
    while head:
        nxt = head.next
        head.next = prev
        prev, head = head, nxt
    return prev` },
  { id: 'py-factorial', lang: 'python', title: 'Factorial', code:
`def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)` },
  { id: 'py-fibonacci', lang: 'python', title: 'Fibonacci', code:
`def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a` },
  { id: 'py-gcd', lang: 'python', title: 'GCD (Euclid)', code:
`def gcd(a, b):
    while b:
        a, b = b, a % b
    return a` },
  { id: 'py-is-prime', lang: 'python', title: 'Prime check', code:
`def is_prime(n):
    if n < 2:
        return False
    for i in range(2, int(n ** 0.5) + 1):
        if n % i == 0:
            return False
    return True` },
  { id: 'py-palindrome', lang: 'python', title: 'Palindrome check', code:
`def is_palindrome(s):
    i, j = 0, len(s) - 1
    while i < j:
        if s[i] != s[j]:
            return False
        i, j = i + 1, j - 1
    return True` },
  { id: 'py-insertion-sort', lang: 'python', title: 'Insertion sort', code:
`def insertion_sort(a):
    for i in range(1, len(a)):
        key, j = a[i], i - 1
        while j >= 0 and a[j] > key:
            a[j + 1] = a[j]
            j -= 1
        a[j + 1] = key
    return a` },
  { id: 'py-count-vowels', lang: 'python', title: 'Count vowels', code:
`def count_vowels(s):
    count = 0
    for ch in s.lower():
        if ch in "aeiou":
            count += 1
    return count` },
  { id: 'py-digit-sum', lang: 'python', title: 'Sum of digits', code:
`def digit_sum(n):
    total = 0
    while n > 0:
        total += n % 10
        n //= 10
    return total` },

  // ------------------------------------------------------------- Java
  { id: 'java-binary-search', lang: 'java', title: 'Binary search', code:
`int bs(int[] a, int l, int r, int x) {
    if (l > r) return -1;
    int m = (l + r) / 2;
    if (a[m] == x) return m;
    if (a[m] < x) l = m + 1;
    else r = m - 1;
    return bs(a, l, r, x);
}` },
  { id: 'java-bubble-sort', lang: 'java', title: 'Bubble sort', code:
`void bubbleSort(int[] a) {
    for (int i = a.length - 1; i > 0; i--)
        for (int j = 0; j < i; j++)
            if (a[j] > a[j + 1])
                swap(a, j, j + 1);
}` },
  { id: 'java-swap', lang: 'java', title: 'Swap in an array', code:
`void swap(int[] a, int i, int j) {
    int t = a[i];
    a[i] = a[j];
    a[j] = t;
}` },
  { id: 'java-list-push', lang: 'java', title: 'Linked list: insert at head', code:
`Node push(Node head, int val) {
    Node n = new Node(val);
    n.next = head;
    return n;
}` },
  { id: 'java-list-append', lang: 'java', title: 'Linked list: insert at end', code:
`Node add(Node h, int v) {
    if (h == null) return new Node(v);
    Node c = h;
    while (c.next != null) c = c.next;
    c.next = new Node(v);
    return h;
}` },
  { id: 'java-list-reverse', lang: 'java', title: 'Reverse a linked list', code:
`Node reverse(Node h) {
    Node prev = null;
    while (h != null) {
        Node next = h.next;
        h.next = prev; prev = h; h = next;
    }
    return prev;
}` },
  { id: 'java-factorial', lang: 'java', title: 'Factorial', code:
`long factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}` },
  { id: 'java-fibonacci', lang: 'java', title: 'Fibonacci', code:
`int fib(int n) {
    int a = 0, b = 1;
    for (int i = 0; i < n; i++) {
        int t = a + b;
        a = b; b = t;
    }
    return a;
}` },
  { id: 'java-palindrome', lang: 'java', title: 'Palindrome check', code:
`boolean isPalindrome(String s) {
    int i = 0, j = s.length() - 1;
    while (i < j)
        if (s.charAt(i++) != s.charAt(j--))
            return false;
    return true;
}` },
  { id: 'java-gcd', lang: 'java', title: 'GCD (recursive)', code:
`int gcd(int a, int b) {
    if (b == 0) return a;
    return gcd(b, a % b);
}` },
  { id: 'java-is-prime', lang: 'java', title: 'Prime check', code:
`boolean isPrime(int n) {
    if (n < 2) return false;
    for (int i = 2; i * i <= n; i++)
        if (n % i == 0) return false;
    return true;
}` },
  { id: 'java-count-vowels', lang: 'java', title: 'Count vowels', code:
`int countVowels(String s) {
    int count = 0;
    for (char c : s.toCharArray())
        if ("aeiouAEIOU".indexOf(c) != -1)
            count++;
    return count;
}` },
  { id: 'java-max', lang: 'java', title: 'Largest element', code:
`int max(int[] a) {
    int m = a[0];
    for (int x : a)
        if (x > m) m = x;
    return m;
}` },
  { id: 'java-insertion-sort', lang: 'java', title: 'Insertion sort', code:
`void insertionSort(int[] a) {
    for (int i = 1; i < a.length; i++) {
        int key = a[i], j = i - 1;
        while (j >= 0 && a[j] > key)
            a[j + 1] = a[j--];
        a[j + 1] = key;
    }
}` },
];

// What the player actually types: each line without its leading indentation,
// joined by one newline (Enter). The server computes the same number.
export function typedLines(code) {
  return code.split('\n').map((line) => {
    const m = /^[ \t]*/.exec(line);
    return { indent: m[0].length, text: line.slice(m[0].length) };
  });
}

export function typedLength(code) {
  const lines = typedLines(code);
  return lines.reduce((n, l) => n + l.text.length, 0) + (lines.length - 1);
}

export const byId = (id) => SNIPPETS.find((s) => s.id === id);
export const forLang = (lang) => SNIPPETS.filter((s) => s.lang === lang);
