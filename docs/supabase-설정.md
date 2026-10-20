# Supabase 설정 안내

할 일을 저장할 인터넷 보관함(Supabase)을 만드는 순서입니다. 10~15분쯤 걸려요.
브라우저에서 하는 일이라 직접 해야 해요. 다 끝나면 **7번의 두 가지 값**을 Claude에게 알려 주세요.

## 1. 가입

1. https://supabase.com 에 들어가서 **Start your project**를 눌러요.
2. **Continue with GitHub**를 골라요. (GitHub 계정이 이미 있으니 가장 쉬워요)

## 2. 프로젝트 만들기

1. **New project**를 눌러요.
2. 아래처럼 채워요.
   - **Name:** `my-todo` (아무 이름이나 괜찮아요)
   - **Database Password:** **Generate a password**를 누르고, 나온 비밀번호를 메모장에 복사해 두세요. (나중에 쓸 일은 거의 없지만 잃어버리면 곤란해요)
   - **Region:** `Northeast Asia (Seoul)`
   - **Plan:** Free
3. **Create new project**를 눌러요. 1~2분 기다리면 준비돼요.

## 3. 할 일 보관함(표) 만들기

1. 왼쪽 메뉴에서 **SQL Editor**를 눌러요.
2. **New query**를 눌러요.
3. 이 저장소의 `supabase/schema.sql` 파일 내용을 전부 복사해서 붙여 넣어요.
4. 오른쪽 아래 **Run**을 눌러요. "Success. No rows returned"가 나오면 성공이에요.

## 4. 이메일 로그인 켜기

1. 왼쪽 메뉴 **Authentication** → **Sign In / Providers** (또는 **Providers**)
2. **Email**이 켜져 있는지(Enabled) 확인해요. 기본으로 켜져 있어요.

## 5. 사이트 주소 등록

로그인 메일의 링크를 눌렀을 때 돌아올 주소를 알려 주는 단계예요.

1. **Authentication** → **URL Configuration**
2. **Site URL**에 이렇게 넣어요:
   `https://parksol9oo.github.io/icp13-psh/`
3. **Redirect URLs**에 **Add URL**로 두 개를 추가해요:
   - `https://parksol9oo.github.io/icp13-psh/`
   - `http://localhost:8000/` (내 컴퓨터에서 테스트할 때 씀)
4. **Save**

## 6. (나중에) 새 사용자 가입 막기

**내가 처음 한 번 로그인한 다음에** 하는 단계예요. 지금은 건너뛰어요.

1. **Authentication** → **Sign In / Providers** → **Email**
2. 또는 **Authentication** → **Settings** 에서 **Allow new users to sign up**을 **끄기**
3. 이러면 내 계정 말고는 아무도 로그인할 수 없어요.

## 7. 연결 정보 복사

1. 왼쪽 아래 **Project Settings**(톱니바퀴) → **API** (또는 **Data API**)
2. 두 가지를 복사해서 Claude에게 보내 주세요:
   - **Project URL** — `https://xxxxxxxx.supabase.co` 모양
   - **anon public** 키 — `eyJ...`로 시작하는 긴 글자

> `anon public` 키는 공개해도 되는 키예요. 사이트 코드에 들어가요.
> 그 아래 **service_role** 키는 **절대 보내지 마세요.** 그건 진짜 비밀 키예요.
