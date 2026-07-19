const urlString = "postgresql://postgres.bejfrelaexozkuqapaao:QWr%3AB%3AVW6k7VyEf@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
const url = new URL(urlString);
console.log("url.username:", url.username);
console.log("decodeURIComponent(url.username):", decodeURIComponent(url.username));
console.log("url.password:", url.password);
console.log("decodeURIComponent(url.password):", decodeURIComponent(url.password));
