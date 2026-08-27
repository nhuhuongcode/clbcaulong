# 🏸 Quỹ CLB Cầu lông

Web app tính tiền sân, tiền cầu và công nợ cho câu lạc bộ cầu lông.
Chạy hoàn toàn trên GitHub Pages (web tĩnh), dữ liệu lưu trong **Google Sheet** của bạn.

---

## Cách tính tiền

### Nhóm buổi

CLB đánh 2 buổi mỗi tuần, ví dụ **thứ 3** và **thứ 5**. Mỗi buổi thuộc về một *nhóm*
(mặc định lấy theo thứ trong tuần: `T3`, `T5`). Thành viên đăng ký cố định **theo từng nhóm**:

- chỉ đăng ký T3,
- chỉ đăng ký T5,
- hoặc cả hai.

Tiền sân của mỗi nhóm được chia riêng cho người đăng ký nhóm đó. Ai đăng ký cả hai thì cộng hai phần lại.

| Khoản | Ai chịu | Công thức |
|---|---|---|
| Tiền sân | Người cố định **của từng nhóm** | `tổng tiền sân của nhóm ÷ số người cố định của nhóm đó` |
| Phí vãng lai | Người **vãng lai** | `giá cố định × số buổi tham gia` (mặc định 50.000đ/buổi) |
| Hoàn vãng lai | Người cố định **của nhóm chứa buổi đó** | `tiền vãng lai thu ở nhóm ÷ số người cố định của nhóm` |
| Tiền cầu | Người **cố định**, theo mức độ tham gia | `tổng tiền cầu × số buổi mình đăng ký ÷ tổng số buổi cả CLB đăng ký` |
| Ứng mua cầu | Người đứng ra mua | trừ thẳng số tiền đã ứng |

Nghĩa là: khách đánh buổi thứ 3 thì tiền đó giảm tiền sân cho **nhóm thứ 3**, và người
đánh 2 buổi/tuần gánh **gấp đôi** tiền cầu so với người đánh 1 buổi/tuần.

**Số tiền phải đóng của một người trong tháng:**

```
Cần đóng = (nợ/dư mang sang từ tháng trước)
         + tiền sân các nhóm đã đăng ký (cộng lại)
         + tiền cầu theo số buổi đăng ký
         − hoàn vãng lai của các nhóm đã đăng ký
         − tiền cầu mình đã ứng mua
         + phí vãng lai của chính mình (những buổi đánh ngoài đăng ký)
         ± điều chỉnh tay
```

**Ví dụ.** Tháng có 5 buổi T3 và 4 buổi T5, sân 400.000đ/buổi.
Nhóm T3 có 6 người, nhóm T5 có 4 người. An đăng ký cả hai, Bình chỉ T5.

- Tiền sân T3: `5 × 400.000 ÷ 6 = 333.000đ/người`
- Tiền sân T5: `4 × 400.000 ÷ 4 = 400.000đ/người`
- An trả `333.000 + 400.000 = 733.000đ`; Bình trả `400.000đ`
- Nếu tháng đó mua 600.000đ tiền cầu, tổng lượt đăng ký là `6×5 + 4×4 = 46`:
  An (9 buổi) gánh `600.000 × 9 ÷ 46 ≈ 117.000đ`, Bình (4 buổi) gánh `≈ 52.000đ`.

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
2. Tab **Buổi đánh** → *Tạo nhanh cả tháng* → chọn các thứ đánh cố định (làm bước này trước,
   vì phải có buổi thì app mới biết tháng có những nhóm nào).
3. Tab **Đăng ký tháng** → *Chép từ tháng trước* → tick lại ai đánh T3, ai đánh T5, ai đánh cả hai.
4. Tab **Bảng thu tiền** → *Sao chép tin nhắn* → dán vào nhóm Zalo.

**Trong tháng:**

- Có người đánh vãng lai → tab **Buổi đánh** → nút *+ Vãng lai* ở đúng buổi.
- Ai mua cầu → tab **Tiền cầu** → *+ Ghi lần mua cầu*, chọn người ứng tiền.
- Ai đóng tiền → tab **Bảng thu tiền** → nút *Thu* ở dòng người đó.

**Cuối tháng:** không cần làm gì thêm. Số dư còn lại tự động chuyển sang tháng sau.

---

## Tạo QR chuyển khoản

Tab **Cài đặt** → mục *Nhận tiền qua QR (VietQR)* → chọn ngân hàng, nhập số tài khoản
(và tên chủ tài khoản nếu muốn). Sau đó ở tab **Bảng thu tiền**, mỗi người còn nợ sẽ có
nút **QR** — bấm vào sẽ hiện mã QR có sẵn đúng số tiền người đó cần đóng và nội dung
chuyển khoản (mặc định: tên người đóng + tháng/năm, tự bỏ dấu cho hợp với mọi ngân hàng).
Bấm **Tải ảnh** để lưu về máy, gửi cho người cần đóng qua Zalo/Messenger.

Mã QR do [VietQR.io](https://vietqr.io) tạo — chuẩn dùng chung giữa các ngân hàng Việt Nam,
quét được bằng mọi app ngân hàng hỗ trợ chuyển nhanh Napas 247.

---

## Mẹo

- **Nghỉ buổi nào** thì xoá buổi đó trong tab *Buổi đánh* — tiền sân của nhóm đó tự giảm.
- **Buổi giá khác** (thuê thêm sân, ngày lễ) → *Sửa* buổi đó và nhập tiền sân riêng.
- **Đá bù sang ngày khác**: sửa ngày của buổi nhưng **giữ nguyên nhóm cũ**. Ví dụ buổi T3 dời
  sang thứ 4 thì vẫn để nhóm `T3`, để tiền vẫn chia cho đúng nhóm người đăng ký T3.
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
