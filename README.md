# 🏸 Quỹ CLB Cầu lông

Web app tính tiền sân, tiền cầu và công nợ cho câu lạc bộ cầu lông.
Chạy hoàn toàn trên GitHub Pages (web tĩnh), dữ liệu lưu trong **Google Sheet** của bạn.

---

## Cách tính tiền

| Khoản | Ai chịu | Công thức |
|---|---|---|
| Tiền sân | Người **cố định** | `tổng tiền sân tháng ÷ số người cố định` |
| Phí vãng lai | Người **vãng lai** | `giá cố định × số buổi tham gia` (mặc định 50.000đ/buổi) |
| Hoàn vãng lai | Người **cố định** được hoàn | `tổng thu vãng lai ÷ số người cố định` |
| Tiền cầu | Người **cố định** | `tổng tiền cầu ÷ số người cố định` |
| Ứng mua cầu | Người đứng ra mua | trừ thẳng số tiền đã ứng |

**Số tiền phải đóng của một người trong tháng:**

```
Cần đóng = (nợ/dư mang sang từ tháng trước)
         + tiền sân
         + tiền cầu
         − hoàn vãng lai
         − tiền cầu mình đã ứng mua
         + phí vãng lai của chính mình (nếu tháng đó không đăng ký cố định)
         ± điều chỉnh tay
```

Sau khi trừ số đã đóng, phần còn lại tự động **mang sang tháng sau** (dương = còn nợ, âm = còn dư).
Nhờ vậy bạn không cần "chốt sổ" thủ công cuối tháng — cứ nhập buổi đánh, vãng lai, tiền cầu,
app tự kết chuyển.

> Người **rời khỏi danh sách cố định** nhưng vẫn còn nợ/dư vẫn xuất hiện trong bảng
> cho đến khi tất toán xong.

---

## Cài đặt

### Bước 1 — Đưa code lên GitHub

```bash
cd CLBcaulong
git init
git add .
git commit -m "Quỹ CLB cầu lông"
git branch -M main
git remote add origin https://github.com/<tên-tài-khoản>/<tên-repo>.git
git push -u origin main
```

Vào repo trên GitHub → **Settings → Pages** → mục *Build and deployment*:

- Source: **Deploy from a branch**
- Branch: **main** / thư mục **/ (root)** → **Save**

Sau 1–2 phút app sẽ chạy tại `https://<tên-tài-khoản>.github.io/<tên-repo>/`.

### Bước 2 — Tạo Google Sheet làm cơ sở dữ liệu

1. Tạo một Google Sheet mới, đặt tên tuỳ ý.
2. Menu **Tiện ích mở rộng → Apps Script**.
3. Xoá code mẫu, dán toàn bộ nội dung file [`apps-script/Code.gs`](apps-script/Code.gs).
4. Sửa dòng đầu:
   ```js
   var TOKEN = 'doi-chuoi-nay-di-nhe';
   ```
   thành một chuỗi bí mật của riêng bạn (ví dụ `clb-caulong-2026-xyz`).
5. Bấm **Lưu**, chọn hàm `setup` trong ô thả xuống, bấm **Chạy**.
   Google sẽ hỏi cấp quyền → *Xem lại quyền* → chọn tài khoản → *Nâng cao* →
   *Chuyển đến … (không an toàn)* → **Cho phép**.
   (Cảnh báo này là bình thường với script tự viết.)
6. Bấm **Triển khai → Tuỳ chọn triển khai mới → Ứng dụng web**:
   - **Thực thi với tư cách:** Tôi
   - **Ai có quyền truy cập:** **Bất kỳ ai** ← bắt buộc, nếu không app sẽ không gọi được
7. Copy **URL ứng dụng web** (dạng `https://script.google.com/macros/s/…/exec`).

### Bước 3 — Nối app với Sheet

Mở app → tab **Cài đặt** → Chế độ: **Google Sheet** → dán URL và TOKEN →
bấm **Kiểm tra kết nối**. Thấy "Kết nối thành công 🎉" là xong.

> Mỗi thiết bị/người dùng cần nhập URL + TOKEN một lần. Thông tin này lưu trong
> trình duyệt, không nằm trong code trên GitHub.

---

## Dùng hằng tháng

**Cuối tháng trước** — chuẩn bị cho tháng mới:

1. Chuyển sang tháng mới ở thanh chọn tháng.
2. Tab **Đăng ký tháng** → *Chép từ tháng trước* → sửa lại ai vào/ai nghỉ.
3. Tab **Buổi đánh** → *Tạo nhanh cả tháng* → chọn các thứ đánh cố định.
4. Tab **Bảng thu tiền** → *Sao chép tin nhắn* → dán vào nhóm Zalo.

**Trong tháng:**

- Có người đánh vãng lai → tab **Buổi đánh** → nút *+ Vãng lai* ở đúng buổi.
- Ai mua cầu → tab **Tiền cầu** → *+ Ghi lần mua cầu*, chọn người ứng tiền.
- Ai đóng tiền → tab **Bảng thu tiền** → nút *Thu* ở dòng người đó.

**Cuối tháng:** không cần làm gì thêm. Số dư còn lại tự động chuyển sang tháng sau.

---

## Mẹo

- **Nghỉ buổi nào** thì xoá buổi đó trong tab *Buổi đánh* — tiền sân tự giảm.
- **Buổi giá khác** (thuê thêm sân, ngày lễ) → *Sửa* buổi đó và nhập tiền sân riêng.
- **Khách ngoài CLB** đánh vãng lai: chọn "— Khách ngoài, thu tiền mặt —".
  Tiền vẫn vào quỹ và hoàn cho người cố định, nhưng không tạo công nợ riêng.
- **Điều chỉnh tay** (nút `±`) dùng cho các khoản lặt vặt: nước uống, phạt đi muộn, bù làm tròn.
- **Sao lưu**: tab *Cài đặt* → *Tải file sao lưu* mỗi vài tháng cho chắc.

---

## Cấu trúc thư mục

```
index.html              giao diện
assets/calc.js          engine tính tiền (thuần JS, không phụ thuộc DOM)
assets/api.js           lớp lưu trữ: Google Sheet hoặc localStorage
assets/app.js           điều khiển giao diện
assets/style.css        giao diện, tự đổi sáng/tối theo hệ thống
apps-script/Code.gs     backend chạy trên Google Apps Script
```

Các sheet được tạo tự động: `Members`, `Months`, `Fixed`, `Sessions`,
`Guests`, `Shuttles`, `Payments`, `Adjustments`, `Settings`.
Bạn có thể mở Google Sheet xem/sửa trực tiếp — nhớ bấm *Tải lại từ Sheet* trong app sau đó.

---

## Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| "Phản hồi không hợp lệ" | Deploy chưa đặt *Ai có quyền truy cập: Bất kỳ ai*. Triển khai lại. |
| "Sai mã bảo mật (token)" | TOKEN trong app khác TOKEN trong `Code.gs`. |
| Sửa `Code.gs` nhưng không thấy đổi | Phải **Triển khai → Quản lý triển khai → sửa → Phiên bản: Mới**. |
| "Dữ liệu đã thay đổi ở nơi khác" | Có người khác vừa lưu. Bấm *Tải lại từ Sheet* rồi nhập lại. |
| Mất mạng | App vẫn chạy bằng bản lưu tạm trong trình duyệt; có mạng lại bấm *Đẩy dữ liệu lên Sheet*. |
